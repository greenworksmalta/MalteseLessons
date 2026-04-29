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


def collect_strings(lesson: dict) -> list[str]:
    """Walk lesson JSON and yield every Maltese string we want spoken."""
    strings = set()

    for sec in lesson["sections"]:
        sid = sec["id"]

        if sid == "phrases":
            for item in sec.get("vocab", []):
                strings.add(item["mt"])
            for line in sec.get("dialogue", []):
                strings.add(line["mt"])

        if sid == "alphabet":
            for letter in sec.get("letters", []):
                # Speak the letter name (lowercase form is most natural)
                strings.add(letter["lower"])
                for w in letter["words"]:
                    strings.add(w["mt"])
            for line in sec.get("passage", {}).get("lines", []):
                strings.add(line["mt"])

        if sid == "grammar":
            for rule in sec.get("rules", []):
                for ex in rule.get("examples", []):
                    strings.add(ex["word"])
                    strings.add(ex["full"])
            for ex in sec.get("exercises", []):
                for item in ex["items"]:
                    strings.add(item["word"])
                    strings.add(item["answer"] + item["word"])  # the article + word together

        if sid == "days":
            for day in sec.get("items", []):
                strings.add(day["mt"])

    return sorted(s for s in strings if s and s.strip())


def synthesize(text: str, key: str, region: str, voice: str = "mt-MT-GraceNeural") -> bytes:
    """One TTS call. Retries 3x on transient errors."""
    ssml = (
        "<speak version='1.0' xml:lang='mt-MT'>"
        f"<voice name='{voice}'>"
        # Slight prosody slow-down helps learners; not too slow.
        "<prosody rate='-8%'>"
        f"{escape_xml(text)}"
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
