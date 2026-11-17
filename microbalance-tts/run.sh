#!/bin/zsh
# Local Kokoro TTS (CPU) for MicroBalance voice output.
cd "$(dirname "$0")"
exec ./.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8023
