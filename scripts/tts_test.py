"""Quick smoke test for Azure TTS Maltese — confirms key + region work."""
import os, sys, pathlib, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).resolve().parent.parent
env = {}
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()

key = env["AZURE_SPEECH_KEY"]
region = env["AZURE_SPEECH_REGION"]

ssml = """<speak version='1.0' xml:lang='mt-MT'>
<voice name='mt-MT-GraceNeural'>Merħba, jiena Francesca.</voice>
</speak>"""

url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
req = urllib.request.Request(
    url,
    data=ssml.encode("utf-8"),
    headers={
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "MalteseLessons/0.1",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        out = ROOT / "scripts" / "_smoketest.mp3"
        out.write_bytes(r.read())
        print(f"OK status={r.status} bytes={out.stat().st_size} -> {out}")
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:500]}")
    sys.exit(1)
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(2)
