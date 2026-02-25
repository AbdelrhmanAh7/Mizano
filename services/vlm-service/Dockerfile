FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# ── System dependencies ─────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    python3.11 python3.11-venv python3-pip \
    libgl1-mesa-glx libglib2.0-0 \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Layer 1: PyTorch (largest package, ~2.5 GB, changes least often) ─
# --default-timeout=300 : 5 min socket timeout (default 15s is too short for multi-GB wheels)
# --retries 3           : retry failed downloads up to 3 times
# --extra-index-url     : pull CUDA 12.4-compatible PyTorch wheels
RUN pip3 install --no-cache-dir \
    --default-timeout=300 \
    --retries 3 \
    --extra-index-url https://download.pytorch.org/whl/cu124 \
    "torch>=2.1.0"

# ── Layer 2: Remaining runtime dependencies ─────────────────────────
COPY requirements.txt .
RUN pip3 install --no-cache-dir \
    --default-timeout=300 \
    --retries 3 \
    -r requirements.txt

# ── Layer 3 (optional): vLLM engine ────────────────────────────────
# Pass --build-arg INSTALL_VLLM=true to include vLLM in the image.
# Default is false because the default ENGINE is "transformers".
ARG INSTALL_VLLM=false
COPY requirements-vllm.txt .
RUN if [ "$INSTALL_VLLM" = "true" ]; then \
        echo "Installing vLLM engine..." && \
        pip3 install --no-cache-dir \
            --default-timeout=300 \
            --retries 3 \
            -r requirements-vllm.txt; \
    else \
        echo "Skipping vLLM (INSTALL_VLLM=$INSTALL_VLLM). Use --build-arg INSTALL_VLLM=true to enable."; \
    fi

# ── Application code ───────────────────────────────────────────────
COPY app/ ./app/

# HuggingFace model cache lives on a mounted volume so models persist across container restarts
ENV HF_HOME=/models
ENV TRANSFORMERS_CACHE=/models
VOLUME /models

EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=10s --start-period=300s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8100/api/v1/health')" || exit 1

# Single worker: model is loaded in memory once; multiple workers would duplicate VRAM usage
CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "1"]
