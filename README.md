# MaltiOnTheGo

**Survival Maltese for life and work in Malta.** Bite-sized lessons, native audio, and an English narrator (Andrew) who walks you through the grammar in plain language. Built for expats who've just landed in Malta and need useful Maltese fast.

## What's inside

- **Native Maltese audio** on every word and sentence (Azure Neural TTS — `mt-MT-GraceNeural`)
- **English-narrated overviews** for every lesson — Andrew (en-US-AndrewMultilingualNeural) walks you through the grammar in plain language with energetic delivery and colour-coded callouts
- **Duolingo-style exercises** — tap-the-translation, listen-and-choose, tap-to-build, match-pairs, fill-the-blank multiple-choice
- **Bite-sized sections** — every lesson splits into 4–5 sections so you can drill what you need
- **Dyslexia-friendly typography** (Lexend), generous spacing, one thing per screen, instant feedback, progress dots
- **Phone-first** — works as a PWA via "Add to Home Screen"

## Lessons

- **Module 1** — phrases, alphabet, grammar, days
- **Module 2** — colours, adjectives, numbers, months, family, hobbies, fruit & veg, dining, traditional food, Wh-questions
- **Module 3** — transport, weekend plans, seasons, particles, the Maltese map, directions, telling the time
- **Extras** — Survival Maltese for working expats (greetings, café, work, shopping)

## Tech

Static site hosted on GitHub Pages. No backend. Audio MP3s are pre-generated and bundled. Progress saved to localStorage.

```
.
├── audio/                     # Pre-generated MP3s (one per Maltese phrase)
├── lessons/                   # Lesson JSONs + overview narration scripts
│   └── overviews/
├── scripts/                   # Audio + narration generators (Python)
├── app.js                     # Single-file app
├── index.html                 # Layout, CSS, mount point
└── manifest.webmanifest       # PWA manifest
```
