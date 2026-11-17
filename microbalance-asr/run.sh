#!/bin/zsh
# Local, free, self-hosted ASR (faster-whisper base.en on CPU).
cd "$(dirname "$0")"
exec ./.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8000
