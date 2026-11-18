#!/bin/zsh
# Local Kokoro TTS (CPU) for MicroBalance voice output.
# Chatterbox is available via `./.venv/bin/python chatterbox_server.py`, but it
# runs ~100x slower than realtime on this Intel CPU, so Kokoro stays default.
cd "$(dirname "$0")"
exec ./.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8023
