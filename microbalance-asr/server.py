"""Local OpenAI-compatible ASR server backed by faster-whisper (CPU, no API key).

Run: ./.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8000
Endpoint: POST /v1/audio/transcriptions  (multipart `file`, optional `language`)
"""
from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel

MODEL_NAME = "whisper-base"
WHISPER_SIZE = "base.en"

app = FastAPI(title="MicroBalance local ASR")
_model: WhisperModel | None = None


def model() -> WhisperModel:
    global _model
    if _model is None:
        # int8 keeps CPU inference fast on laptops; no GPU or network needed after download.
        _model = WhisperModel(WHISPER_SIZE, device="cpu", compute_type="int8")
    return _model


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/v1/audio/transcriptions")
async def transcriptions(
    file: UploadFile = File(...),
    model_name: str = Form("", alias="model"),
    language: Optional[str] = Form(None),
) -> JSONResponse:
    suffix = Path(file.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as handle:
        handle.write(await file.read())
        handle.flush()
        segments, _info = model().transcribe(
            handle.name,
            language=language or "en",
            beam_size=1,
            vad_filter=True,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
    return JSONResponse({"text": text, "model": model_name or MODEL_NAME})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
