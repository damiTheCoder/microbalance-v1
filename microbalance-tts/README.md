# microbalance-tts

Local, self-hosted Kokoro TTS for the MicroBalance voice replies. CPU only, no
API key, OpenAI-compatible endpoint.

## Run

```bash
~/.local/bin/uv venv --python 3.12 .venv
~/.local/bin/uv pip install --python .venv/bin/python -r requirements.txt
./run.sh          # http://127.0.0.1:8023
```

The first request downloads the Kokoro-82M weights (~330 MB) from Hugging Face;
later requests are fully local (~5-15 s per reply on CPU).

## API

`POST /v1/audio/speech`:

```bash
curl -X POST http://127.0.0.1:8023/v1/audio/speech \
  -H 'content-type: application/json' \
  -d '{"model":"tts-1","voice":"af_bella","input":"Here is your trial balance."}' \
  -o reply.wav
```

Returns `audio/wav` (24 kHz mono). `GET /health` reports readiness.

## Plugin settings

DSH → Settings → voice chat → 朗读设置 → TTS engine **自定义 (Custom)**:

- Base URL: `http://127.0.0.1:8023/v1`
- Model: `tts-1`
- API key: `sk-local-kokoro`
- Voice: `af_bella`

The plugin applies its "Speech Director" step (extra pauses after `.` `,` `?`
`!`) before calling this endpoint.
