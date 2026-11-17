"""Local Kokoro TTS server with an OpenAI-compatible speech endpoint.

Run: ./.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8023
Endpoint: POST /v1/audio/speech  {model, voice, input}  -> audio/wav
"""
from __future__ import annotations

import io
from typing import Any

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response
from kokoro import KPipeline

DEFAULT_VOICE = "af_bella"
# A touch below native speed keeps Kokoro's delivery calm and unhurried.
SPEED = 0.92

app = FastAPI(title="MicroBalance Kokoro TTS")
_pipeline: KPipeline | None = None


def pipeline() -> KPipeline:
    global _pipeline
    if _pipeline is None:
        # lang_code 'a' = American English voices (af_bella, af_nicole, ...).
        _pipeline = KPipeline(lang_code="a", device="cpu")
    return _pipeline


def render(text: str, voice: str, speed: float) -> bytes:
    chunks: list[np.ndarray] = []
    for _graphemes, _phonemes, audio in pipeline()(text, voice=voice, speed=speed):
        if isinstance(audio, torch.Tensor):
            audio = audio.detach().cpu().numpy()
        chunks.append(np.asarray(audio, dtype=np.float32))
    if not chunks:
        raise ValueError("Kokoro produced no audio")
    buffer = io.BytesIO()
    sf.write(buffer, np.concatenate(chunks), 24000, format="WAV")
    return buffer.getvalue()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": "kokoro", "voice": DEFAULT_VOICE}


@app.post("/v1/audio/speech")
async def speech(payload: dict[str, Any]) -> Response:
    text = str(payload.get("input") or "").strip()
    if text == "":
        return JSONResponse({"error": {"message": "input is required"}}, status_code=400)
    voice = str(payload.get("voice") or DEFAULT_VOICE)
    try:
        speed = float(payload.get("speed") or SPEED)
    except (TypeError, ValueError):
        speed = SPEED
    try:
        audio = render(text, voice, speed)
    except Exception as error:  # noqa: BLE001 - surface synthesis failures to the plugin
        return JSONResponse({"error": {"message": str(error)}}, status_code=500)
    return Response(content=audio, media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8023)
