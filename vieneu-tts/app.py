"""VieNeu TTS HTTP service for the /constellation CONSTELLATION_TTS_URL slot.

Two endpoints, both backed by VieNeu-TTS (bilingual vi+en; infer_stream takes NO
lang param — language is inferred from the text). `lang` selects the VOICE preset
only.

  POST /tts        {text, lang} -> audio/wav                (whole clip; fallback/debug)
  POST /tts/stream {text, lang} -> application/octet-stream  (PCM Int16LE 48kHz mono, streamed)

Piper (en) was removed: VieNeu pronounces English correctly on its own (bilingual
En-Vi model), it just ships no English-named *speaker* — see the "Emma" preset below.
"""
import io
import unicodedata
import wave
from pathlib import Path
from typing import Iterator, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from vieneu import Vieneu

# "Emma" preset loaded at startup (see load_engine) — VieNeu ships no English-named
# preset (all 14 built-ins are Vietnamese speakers), so `en` gets its own voice cloned
# from an English reference clip (tts-samples/vieneu-emma.wav) rather than reusing a
# Vietnamese preset. voices/emma-voice.json holds the precomputed speaker embedding +
# reference codes (plain numbers, no torch needed to load); voices/en-emma-ref.wav is
# kept only as the source clip for regenerating it — see voices/README.md.
EN_VOICE_NAME = "Emma"
EMMA_VOICE_FILE = Path(__file__).parent / "voices" / "emma-voice.json"
VOICE_BY_LANG = {"vi": "Thục Đoan", "en": EN_VOICE_NAME}
DEFAULT_VOICE = "Thục Đoan"
SAMPLE_RATE = 48000  # VieNeu native rate; also the shared constant the client assumes.

app = FastAPI()
_engine: Optional[Vieneu] = None


@app.on_event("startup")
def load_engine() -> None:
    global _engine
    _engine = Vieneu()
    _engine._load_voices_from_file(EMMA_VOICE_FILE)
    if EN_VOICE_NAME not in _engine._preset_voices:
        # _load_voices_from_file logs-and-continues on a bad/missing path (see its
        # try/except) instead of raising — without this check a broken image would
        # start "healthy" and only fail per-request at _resolve_ref for `en` text.
        raise RuntimeError(f"'{EN_VOICE_NAME}' preset missing after loading {EMMA_VOICE_FILE}")


class TtsRequest(BaseModel):
    text: str
    lang: str = "vi"


def _voice_for(lang: str) -> str:
    # Pass the preset NAME string straight to infer/infer_stream — vieneu's `voice`
    # param accepts a str, and this is the proven path from the prior app.py
    # (`infer(text, voice="Thục Đoan")`). Verified: infer_stream(text, voice="Thục Đoan")
    # works. No get_preset_voice indirection (simpler; can't AttributeError).
    return VOICE_BY_LANG.get(lang, DEFAULT_VOICE)


_VI_DIACRITIC_MAP = str.maketrans("đĐ", "dD")


def _prepare_text(text: str, lang: str) -> str:
    # VieNeu's phonemizer (sea_g2p) classifies language for the WHOLE input, not
    # per-word: one Vietnamese proper noun (e.g. "Cảng Định An") anywhere in the
    # sentence flips ambiguous alnum tokens elsewhere ("v3", "C4K") to Vietnamese
    # reading too ("vê ba", "xê bốn ca") — even tokens right next to English words.
    # Verified: an explicit <en>...</en> wrap does NOT fix this (it also skips the
    # digit→word expansion, leaving a raw "3" in the phoneme stream). Stripping
    # Vietnamese diacritics removes the signal that biases the classifier, so an
    # `en` reply reads consistently in English; Vietnamese proper nouns fall back
    # to an English-accented approximation instead of Vietnamese tones — the same
    # trade-off a human English speaker makes reading a foreign name aloud.
    if lang != "en":
        return text
    text = _spell_out_vulgar_fractions(text)
    text = text.translate(_VI_DIACRITIC_MAP)
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def _spell_out_vulgar_fractions(text: str) -> str:
    # Unicode vulgar-fraction glyphs ("½", "¾"...) get expanded to Vietnamese words
    # by sea_g2p's normalizer UNCONDITIONALLY — unlike plain ASCII "1/2", this one
    # ignores the surrounding language context entirely (verified: "½ pound" reads
    # "một phần hai pound" even in an all-English, diacritic-free sentence). Spell
    # them out ourselves first so the normalizer never sees the raw glyph. Unicode's
    # own character name ("VULGAR FRACTION ONE HALF") gives the English words for free.
    out = []
    for c in text:
        name = unicodedata.name(c, "")
        if name.startswith("VULGAR FRACTION "):
            out.append(name[len("VULGAR FRACTION "):].lower())
        else:
            out.append(c)
    return "".join(out)


def _to_int16_bytes(frame: np.ndarray) -> bytes:
    return (np.clip(frame, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()


@app.post("/tts")
def synthesize(req: TtsRequest) -> Response:
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="no text")
    audio = _engine.infer(_prepare_text(req.text, req.lang), voice=_voice_for(req.lang))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(_to_int16_bytes(audio))
    return Response(content=buf.getvalue(), media_type="audio/wav")


@app.post("/tts/stream")
def synthesize_stream(req: TtsRequest) -> StreamingResponse:
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="no text")
    voice = _voice_for(req.lang)
    text = _prepare_text(req.text, req.lang)

    def gen() -> Iterator[bytes]:
        for frame in _engine.infer_stream(text, voice=voice):
            yield _to_int16_bytes(frame)

    return StreamingResponse(gen(), media_type="application/octet-stream")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "engine": "vieneu", "sample_rate": SAMPLE_RATE, "langs": sorted(VOICE_BY_LANG)}
