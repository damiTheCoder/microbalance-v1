# microbalance-tts

Local, self-hosted TTS for MicroBalance voice replies. CPU only, no API key,
OpenAI-compatible endpoint on port 8023.

- `server.py` — Kokoro (fast; default while Chatterbox is too slow on this CPU).
- `chatterbox_server.py` — Chatterbox (Resemble AI) built-in default voice.

## Run

```bash
./run.sh                 # Kokoro (default)
./.venv/bin/python chatterbox_server.py   # Chatterbox (slow on this CPU)
```

Chatterbox measured ~175 s for 1.7 s of audio on this Intel i5 (no GPU), versus
~1 s for Kokoro, so the live voice loop stays on Kokoro.
