"""Local Chatterbox TTS server (Resemble AI) with the built-in default voice.

No VOICE_SAMPLE_PATH / audio prompt is set, so Chatterbox uses the default
speaker conditioning bundled with the model (no voice cloning).

Run: ./.venv/bin/python chatterbox_server.py
Endpoint: POST /v1/audio/speech  {"input": "<text>"}  -> audio/wav
"""
from __future__ import annotations

import io
import os
import threading
from typing import Any

import numpy as np
import soundfile as sf
import torch
from flask import Flask, Response, jsonify, request

# The autoregressive decoder is CPU-bound; use every available core.
torch.set_num_threads(max(1, os.cpu_count() or 1))

app = Flask(__name__)
_model: Any = None
_model_lock = threading.Lock()
_generate_lock = threading.Lock()


def model() -> Any:
    """Load Chatterbox once, on first synthesis request."""
    global _model
    with _model_lock:
        if _model is None:
            from chatterbox.tts import ChatterboxTTS

            _model = ChatterboxTTS.from_pretrained(device="cpu")
        return _model


@app.after_request
def add_cors_headers(response: Response) -> Response:
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.route("/v1/audio/speech", methods=["OPTIONS"])
def speech_options() -> Response:
    return Response(status=204)


@app.get("/health")
def health() -> Response:
    return jsonify({"status": "ok", "engine": "chatterbox", "voice": "default"})


@app.post("/v1/audio/speech")
def speech() -> Response:
    payload = request.get_json(silent=True) or {}
    text = str(payload.get("input") or "").strip()
    if text == "":
        return jsonify({"error": {"message": "input is required"}}), 400

    options: dict[str, float] = {}
    for key in ("exaggeration", "cfg_weight", "temperature", "repetition_penalty"):
        value = payload.get(key)
        if value is not None:
            try:
                options[key] = float(value)
            except (TypeError, ValueError):
                return jsonify({"error": {"message": f"{key} must be a number"}}), 400

    try:
        with _generate_lock:
            wav = model().generate(text, **options)
            buffer = io.BytesIO()
            sf.write(
                buffer,
                np.asarray(wav.squeeze(0).cpu().numpy(), dtype=np.float32),
                int(model().sr),
                format="WAV",
            )
    except Exception as error:  # noqa: BLE001 - surface synthesis failures to the plugin
        return jsonify({"error": {"message": str(error)}}), 500

    return Response(buffer.getvalue(), mimetype="audio/wav")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8023, threaded=False)
