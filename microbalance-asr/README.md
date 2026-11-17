# microbalance-asr

Local, free, self-hosted speech-to-text for the MicroBalance voice input.
Runs [faster-whisper](https://github.com/SYSTRAN/faster-whisper) `base.en` on the
CPU with int8 quantization — no API key and no network after the model download.

## Run

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./run.sh          # http://127.0.0.1:8000
```

The first transcription downloads the `base.en` weights (~140 MB) into
`~/.cache/huggingface`; later requests are local only.

## API

`POST /v1/audio/transcriptions` — OpenAI-compatible multipart upload:

```bash
curl -X POST http://127.0.0.1:8000/v1/audio/transcriptions \
  -F "file=@sample.webm" -F "model=whisper-base"
# {"text": "Good morning. Please show me the trial balance for this month."}
```

## Plugin settings

DSH → Settings → voice chat → 语音识别设置:

- ASR engine: **自定义 (Custom)**
- Base URL: `http://127.0.0.1:8000/v1`
- Model: `whisper-base`
- API key: `sk-local-free` (ignored by the server)
