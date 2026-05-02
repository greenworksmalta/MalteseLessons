# Recorded Maltese audio

Drop human-recorded MP3 / M4A / WAV / OGG clips in this folder. They override the Azure TTS audio for matching Maltese text whenever the app needs to play that word.

The mapping from Maltese text → recorded filename lives in `../recorded.json`. The app fetches that on boot and checks it before falling back to the Azure-generated MP3 in `../<hash>.mp3`.

## Adding a clip

```bash
python scripts/add_recording.py "<Maltese text>" <path/to/recording>
```

Example:

```bash
python scripts/add_recording.py "kafè" ~/Downloads/kafe.m4a
```

The script copies the file into this folder with a normalised name and adds an entry to `recorded.json`.
