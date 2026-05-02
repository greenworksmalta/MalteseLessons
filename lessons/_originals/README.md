# Original lesson content — pre-rewrite backups

These are snapshots of the lesson JSONs before the copyright-safety
rewrites. They contain the curated vocab selections, dialogues and
exercise items derived directly from the source course PDFs.

## Why they're here

If a rewrite ever needs to be rolled back, or we want to compare a
specific exercise / dialogue against the original, the unmodified
versions live here.

The titles inside these files already use the new naming scheme
(e.g. "Lesson 1 — Hello & the Alphabet") — only the content is original.

## Files

- `lesson1.json` — Andrew-derived content for Lesson 1
- `overviews/lesson1.json` — original overview narration transcript

(Add more as further lessons are rewritten.)

## Restoring

```bash
cp lessons/_originals/lesson1.json lessons/lesson1.json
cp lessons/_originals/overviews/lesson1.json lessons/overviews/lesson1.json
python scripts/generate_audio.py lessons/lesson1.json
python scripts/generate_narration.py lesson1
```
