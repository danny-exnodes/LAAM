# TTS server for the /constellation CONSTELLATION_TTS_URL slot.
# VieNeu-TTS covers both en + vi; Piper removed. VieNeu-TTS is torch-free
# (ONNX/int8, CPU-only), Apache-2.0 licensed.
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Warm the VieNeu-TTS v3-Turbo ONNX checkpoint into the image at build time
# (it's pulled via huggingface_hub on first `Vieneu()` call) so the running
# container needs no internet access and no first-request cold start.
RUN python -c "from vieneu import Vieneu; Vieneu()"

EXPOSE 5002

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5002/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5002"]
