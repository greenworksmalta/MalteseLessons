"""
Generate Maltese MP3s via Azure Neural TTS for every Maltese string in a lesson JSON.

- Names files by SHA1[:12] of the Maltese text — stable, dedup-friendly.
- Skips files that already exist (re-runs are cheap).
- Writes a manifest.json mapping mt text -> filename.
- Uses mt-MT-GraceNeural by default; optionally Joseph for variety.

Usage:
    python scripts/generate_audio.py lessons/lesson1.json
"""
import hashlib
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

# Force UTF-8 stdout so Maltese characters (ċ ġ ħ ż għ) print correctly on Windows
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "audio"
AUDIO_DIR.mkdir(exist_ok=True)


def load_env() -> dict:
    env = {}
    env_path = ROOT / ".env"
    if not env_path.exists():
        sys.exit("Missing .env — copy .env.example and fill in your Azure key.")
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def hash_id(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


# Field names whose values are Maltese strings we want voiced. Walked recursively.
VOICE_FIELDS = {
    "mt", "alt", "full", "phrase", "long", "short",
    "singular", "collective", "plural", "feminine",
    "word", "sentence",
    "pronoun", "form", "imperative",
    "example", "q", "a", "answer",
    "lower",  # alphabet letter sounds
}
# Don't voice these specific values even if they appear in voice fields (structural labels).
DENY_VALUES = {
    "singular", "plural", "vowel", "consonant",
    "M", "F", "veru", "falz",
}
# Don't recurse into these fields (they hold artificial patterns / English / data we don't voice).
SKIP_FIELDS = {
    "en", "qen", "aen", "example_en",
    "model", "prefix", "scrambled", "syllables",
    "instructions", "intro", "title", "subtitle", "explanation",
    "choices", "letters", "facts", "id", "icon",
    "n",  # number
}


def walk(node, out: set):
    if isinstance(node, dict):
        # Handle the alphabet "letters" array of letter objects (need lower + each word.mt)
        # and the grammar "examples" lists. The recursion below covers them; we just need
        # to special-case when we walk into "letters" arrays under alphabet sections.
        for k, v in node.items():
            if k in SKIP_FIELDS:
                continue
            if k in VOICE_FIELDS and isinstance(v, str):
                if v.strip() and v not in DENY_VALUES:
                    out.add(v)
            walk(v, out)
    elif isinstance(node, list):
        for item in node:
            walk(item, out)


def collect_strings(lesson: dict) -> list[str]:
    """Walk a lesson JSON and yield every Maltese string we want spoken.

    Driven by VOICE_FIELDS (field names) + DENY_VALUES (structural strings to skip).
    Special handling for alphabet 'letters' arrays so we voice each letter sound.
    """
    strings: set[str] = set()
    walk(lesson, strings)

    # Special case: alphabet section letters[].lower (covered by VOICE_FIELDS)
    # and alphabet letter words (covered by mt). Already handled.

    # Concatenate article+word for grammar exercises so we have audio for "il-bieb" etc.
    for sec in lesson.get("sections", []):
        if sec.get("id") == "grammar":
            for ex in sec.get("exercises", []) or []:
                for item in ex.get("items", []) or []:
                    if "answer" in item and "word" in item:
                        a, w = item["answer"], item["word"]
                        if a not in DENY_VALUES:
                            strings.add(a + w)

    return sorted(s for s in strings if s and s.strip() and len(s) <= 200)


# Pronunciation rewrites — Azure's mt-MT neural voices treat final 'è' as a
# silent French-style vowel and drop it (so "kafè" becomes "kaff", "tè" becomes
# "t"). To force the open-/ɛ/ ending Maltese natives use, we rewrite the text
# directly before sending to Azure. The hash key (and therefore the audio
# filename + the display text in the app) still uses the original spelling.
SUBSTRING_REWRITES = [
    # Final-e treatment by mt-MT voices is finicky:
    #   è  → silent (dropped)
    #   eh → drawn-out 'ehhh'
    #   e  → still aspirated with a soft 'h' tail
    # Acute é forces the short closed /e/ Azure uses for Spanish/Italian
    # loanwords, which is the cleanest fit for the Maltese pronunciation
    # without the silent-vowel or aspiration artifacts.
    ("Kafè", "Kafé"),
    ("kafè", "kafé"),
    ("Tè",   "Té"),
    ("tè",   "té"),
]


def rewrite_for_speech(text: str) -> str:
    out = text
    for src, dst in SUBSTRING_REWRITES:
        out = out.replace(src, dst)
    return out


# Joseph's male voice handles these loanwords noticeably more Maltese-ly than
# Grace. Used when the entire token is one of these standalone words.
JOSEPH_VOICE_PHRASES = {
    "kafè", "tè", "kafè bil-ħalib", "tè bil-lumi", "kikkra kafè",
}
_JOSEPH_LOWER = {p.lower() for p in JOSEPH_VOICE_PHRASES}


def pick_voice(text: str, default: str) -> str:
    if text.strip().lower() in _JOSEPH_LOWER:
        return "mt-MT-JosephNeural"
    return default


def synthesize(text: str, key: str, region: str, voice: str = "mt-MT-GraceNeural") -> bytes:
    """One TTS call. Retries on transient errors. The text passed to Azure may
    differ from the input `text` (rewrites for tricky pronunciations) but the
    hash key + audio filename remain tied to the original."""
    chosen_voice = pick_voice(text, voice)
    spoken = rewrite_for_speech(text)
    ssml = (
        "<speak version='1.0' xml:lang='mt-MT'>"
        f"<voice name='{chosen_voice}'>"
        "<prosody rate='-8%'>"
        f"{escape_xml(spoken)}"
        "</prosody>"
        "</voice>"
        "</speak>"
    )
    url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    headers = {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "MalteseLessons/0.1",
    }
    last_err = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, data=ssml.encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:200]
            last_err = f"HTTP {e.code}: {body}"
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(last_err)
        except Exception as e:
            # Network blips (DNS, reset) — back off and retry
            last_err = f"{type(e).__name__}: {e}"
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Failed after 5 attempts: {last_err}")


def escape_xml(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;").replace("'", "&apos;"))


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python scripts/generate_audio.py lessons/lesson1.json")
    lesson_path = ROOT / sys.argv[1]
    lesson = json.loads(lesson_path.read_text(encoding="utf-8"))

    env = load_env()
    key = env["AZURE_SPEECH_KEY"]
    region = env["AZURE_SPEECH_REGION"]

    strings = collect_strings(lesson)
    print(f"[plan] {len(strings)} unique Maltese strings to voice")

    manifest_path = AUDIO_DIR / "manifest.json"
    manifest = {}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    new_count = 0
    skip_count = 0
    fail_count = 0
    char_count = 0

    for i, text in enumerate(strings, 1):
        h = hash_id(text)
        filename = f"{h}.mp3"
        out = AUDIO_DIR / filename

        if out.exists() and manifest.get(text) == filename:
            skip_count += 1
            continue

        try:
            audio = synthesize(text, key, region)
            out.write_bytes(audio)
            manifest[text] = filename
            new_count += 1
            char_count += len(text)
            print(f"[{i:3d}/{len(strings)}] {h} ({len(text):3d}c) {text[:50]}")
        except Exception as e:
            fail_count += 1
            try:
                print(f"[{i:3d}/{len(strings)}] FAIL {text[:50]}: {e}")
            except UnicodeEncodeError:
                print(f"[{i:3d}/{len(strings)}] FAIL <unprintable>: {e}")

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(f"\n[done] new={new_count} skipped={skip_count} failed={fail_count} chars={char_count}")
    print(f"[manifest] {manifest_path}")


if __name__ == "__main__":
    main()
