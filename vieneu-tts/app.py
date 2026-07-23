"""VieNeu TTS HTTP service for the /constellation CONSTELLATION_TTS_URL slot.

Two endpoints, both backed by VieNeu-TTS (bilingual vi+en; infer_stream takes NO
lang param — language is inferred from the text). `lang` selects the VOICE preset
only (seam for a future per-language English voice); today all langs use one preset.

  POST /tts        {text, lang} -> audio/wav                (whole clip; fallback/debug)
  POST /tts/stream {text, lang} -> application/octet-stream  (PCM Int16LE 48kHz mono, streamed)

Piper (en) was removed: VieNeu covers English too, and streaming is VieNeu-only.
"""
import io
import wave
from typing import Iterator, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from vieneu import Vieneu

# lang -> VieNeu preset voice. Seam for a future English "Emma" voice; both default
# to the current Southern female preset for now (Emma "tạm thời chưa cần").
VOICE_BY_LANG = {"vi": "Thục Đoan", "en": "Thục Đoan"}
DEFAULT_VOICE = "Thục Đoan"
SAMPLE_RATE = 48000  # VieNeu native rate; also the shared constant the client assumes.

app = FastAPI()
_engine: Optional[Vieneu] = None


@app.on_event("startup")
def load_engine() -> None:
    global _engine
    _engine = Vieneu()


class TtsRequest(BaseModel):
    text: str
    lang: str = "vi"


def _voice_for(lang: str) -> str:
    # Pass the preset NAME string straight to infer/infer_stream — vieneu's `voice`
    # param accepts a str, and this is the proven path from the prior app.py
    # (`infer(text, voice="Thục Đoan")`). Verified: infer_stream(text, voice="Thục Đoan")
    # works. No get_preset_voice indirection (simpler; can't AttributeError).
    return VOICE_BY_LANG.get(lang, DEFAULT_VOICE)


def _to_int16_bytes(frame: np.ndarray) -> bytes:
    return (np.clip(frame, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()


@app.post("/tts")
def synthesize(req: TtsRequest) -> Response:
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="no text")
    audio = _engine.infer(req.text, voice=_voice_for(req.lang))
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

    def gen() -> Iterator[bytes]:
        for frame in _engine.infer_stream(req.text, voice=voice):
            yield _to_int16_bytes(frame)

    return StreamingResponse(gen(), media_type="application/octet-stream")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "engine": "vieneu", "sample_rate": SAMPLE_RATE, "langs": sorted(VOICE_BY_LANG)}
