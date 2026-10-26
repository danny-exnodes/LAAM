# voices/

- `emma-voice.json` — the "Emma" English preset actually used at runtime (`app.py`
  loads it via `Vieneu()._load_voices_from_file(...)`). Just a speaker embedding
  (192 floats) + reference codes (plain numbers) — no torch needed to load or use it,
  keeping the container's torch-free ONNX runtime intact.
- `en-emma-ref.wav` — the source reference clip (`tts-samples/piper-en-1.wav`) kept
  for provenance / regenerating the preset. Not read by `app.py`.

## Regenerating emma-voice.json

Enrolling a *new* reference clip needs `torch` + `torchaudio` (VieNeu's speaker
encoder), which this service's `requirements.txt` deliberately does not install.
Do this in a separate throwaway env, not in the vieneu-tts container:

```bash
pip install vieneu torch torchaudio soundfile
python -c "
from pathlib import Path
from vieneu import Vieneu
engine = Vieneu()
engine.add_voice('Emma', ref_audio='en-emma-ref.wav', description='English (cloned reference)', gender='female')
engine.save_voices('all-voices.json')
"
```

Then copy just the `"Emma"` entry out of `all-voices.json`'s `presets` into
`emma-voice.json`'s `presets` (keep the rest of this repo's voices file untouched).
