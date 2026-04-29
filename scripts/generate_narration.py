"""
Generate one MP3 per lesson narration via Azure Neural TTS, using two voices in
a single SSML document: en-GB-LibbyNeural for English narration and
mt-MT-GraceNeural for the Maltese examples spoken inline.

Reads:  lessons/overviews/<lessonId>.json
Writes: audio/narration_<lessonId>.mp3

Usage:
    python scripts/generate_narration.py            # all lessons
    python scripts/generate_narration.py lesson1    # one lesson
"""
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "audio"
OVERVIEWS_DIR = ROOT / "lessons" / "overviews"

EN_VOICE = "en-GB-SoniaNeural"   # Supports expression styles ("cheerful")
MT_VOICE = "mt-MT-GraceNeural"
EN_STYLE = "cheerful"
EN_STYLE_DEGREE = "1.4"           # Range 0.01 - 2.0; 1.4 = noticeably upbeat without cartoon


def load_env() -> dict:
    env = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def escape_xml(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;").replace("'", "&apos;"))


# Strip pictographic emojis from spoken text (they're decorative on screen).
import re as _re
_EMOJI_RE = _re.compile(
    "[\U0001F300-\U0001FAFF"   # symbols & pictographs, transport, supplemental
    "\U00002600-\U000027BF"    # misc symbols, dingbats
    "\U0001F1E6-\U0001F1FF"    # regional indicator (flags)
    "\U0001F900-\U0001F9FF"    # supplemental symbols and pictographs
    "‍️]+"          # ZWJ, variation selector
)
def strip_emojis(s: str) -> str:
    return _EMOJI_RE.sub("", s).replace("  ", " ").strip()


def build_ssml(transcript: list) -> str:
    """Convert a transcript list of {en} and {mt} segments into SSML with two voices.

    English is wrapped in <mstts:express-as style='cheerful'> for energetic delivery.
    Closes inner tags before switching voices, otherwise Azure rejects with 400.
    """
    parts = ["<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' "
             "xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-GB'>"]
    last_voice = None
    for seg in transcript:
        if "en" in seg:
            voice = EN_VOICE
            text = strip_emojis(seg["en"])  # don't make TTS read the visual emojis
            if not text:
                continue
        elif "mt" in seg:
            voice = MT_VOICE
            text = strip_emojis(seg["mt"])
            if not text:
                continue
        else:
            continue
        if voice != last_voice:
            if last_voice is not None:
                parts.append("</prosody>")
                if last_voice == EN_VOICE:
                    parts.append("</mstts:express-as>")
                parts.append("</voice>")
            if voice == EN_VOICE:
                # Cheerful style + slight pace bump for energy. styledegree dialed up.
                parts.append(f"<voice name='{voice}'>"
                             f"<mstts:express-as style='{EN_STYLE}' styledegree='{EN_STYLE_DEGREE}'>"
                             f"<prosody rate='+2%' pitch='+1st'>")
            else:
                parts.append(f"<voice name='{voice}'><prosody rate='-6%'>")
            last_voice = voice
        parts.append(escape_xml(text))
        parts.append("<break time='220ms'/>" if voice == EN_VOICE else "<break time='350ms'/>")
    if last_voice is not None:
        parts.append("</prosody>")
        if last_voice == EN_VOICE:
            parts.append("</mstts:express-as>")
        parts.append("</voice>")
    parts.append("</speak>")
    return "".join(parts)


def synthesize(ssml: str, key: str, region: str) -> bytes:
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
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:500]
            headers_dump = dict(e.headers) if hasattr(e, "headers") else {}
            last_err = f"HTTP {e.code}: body={body!r} reason={e.reason!r} hdrs={list(headers_dump.keys())}"
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt); continue
            raise RuntimeError(last_err)
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Failed: {last_err}")


def char_count(transcript: list) -> int:
    return sum(len(seg.get("en", "")) + len(seg.get("mt", "")) for seg in transcript)


def split_for_voice_limit(transcript: list, max_voices: int = 40) -> list:
    """Split transcript into chunks where each chunk's SSML uses ≤ max_voices <voice> tags.

    Azure caps a single SSML at 50 voice elements; we batch and concatenate the MP3
    output. Each voice change in build_ssml emits one new <voice> tag.
    """
    chunks, current, current_voice_count, last_voice = [], [], 0, None
    for seg in transcript:
        v = "en" if "en" in seg else ("mt" if "mt" in seg else None)
        if v is None:
            continue
        new_voice = (v != last_voice)
        if new_voice and current_voice_count >= max_voices:
            chunks.append(current)
            current, current_voice_count, last_voice = [], 0, None
            new_voice = True
        current.append(seg)
        if new_voice:
            current_voice_count += 1
            last_voice = v
    if current:
        chunks.append(current)
    return chunks


def main():
    env = load_env()
    key, region = env["AZURE_SPEECH_KEY"], env["AZURE_SPEECH_REGION"]
    AUDIO_DIR.mkdir(exist_ok=True)

    targets = sys.argv[1:] if len(sys.argv) > 1 else None
    files = sorted(OVERVIEWS_DIR.glob("*.json"))
    if targets:
        files = [f for f in files if f.stem in targets]

    if not files:
        sys.exit("No overview JSONs to process.")

    total_chars = 0
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        lid = data["lessonId"]
        transcript = data["transcript"]
        out = AUDIO_DIR / f"narration_{lid}.mp3"
        n = char_count(transcript)
        total_chars += n
        chunks = split_for_voice_limit(transcript, max_voices=40)
        print(f"[{lid}] {len(transcript)} segments, ~{n} chars, {len(chunks)} batch(es) -> {out.name}")
        try:
            buf = bytearray()
            for i, chunk in enumerate(chunks, 1):
                ssml = build_ssml(chunk)
                audio = synthesize(ssml, key, region)
                buf.extend(audio)
                print(f"  batch {i}/{len(chunks)}: {len(audio)//1024} KB")
            out.write_bytes(bytes(buf))
            kb = out.stat().st_size // 1024
            print(f"  ✓ wrote {kb} KB")
        except Exception as e:
            print(f"  ✗ FAILED: {e}")

    print(f"\n[done] total ~{total_chars} chars across {len(files)} lessons")


if __name__ == "__main__":
    main()
