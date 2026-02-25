# Mizano VLM Service

A standalone Python **FastAPI** microservice that uses a locally-quantized Vision-Language Model
([Qwen2.5-VL-7B-Instruct-AWQ](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct-AWQ)) to extract
structured data from invoice and bill images. Runs **100% locally** — zero external API calls.

Part of the [Mizano ERP](../../README.md) monorepo. The NestJS API calls this service over HTTP
(see `prompt-2-nestjs-integration`).

---

## Hardware Requirements

| Resource           | Minimum | Recommended |
| ------------------ | ------- | ----------- |
| GPU VRAM           | 12 GB   | 16 GB       |
| System RAM         | 16 GB   | 32 GB       |
| Disk (model cache) | 6 GB    | 10 GB       |

> The AWQ 4-bit quantized model uses ~5 GB VRAM, leaving headroom for the KV cache.
> **No GPU needed for mock mode** (development & CI).

---

## Port

**`8100`** — does not conflict with existing Mizano services:

| Service         | Port     |
| --------------- | -------- |
| Next.js web     | 5001     |
| NestJS API      | 6000     |
| PostgreSQL      | 5435     |
| Redis           | 6380     |
| **VLM Service** | **8100** |

---

## Local Setup

```bash
cd services/vlm-service

# 1. Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate          # Linux / macOS
# or: venv\Scripts\activate       # Windows (cmd/PowerShell)

# 2. Install dependencies
pip install -r requirements.txt

# 3. Copy env file
cp .env.example .env
```

---

## Running

### Mock Mode — no GPU needed

Set `VLM_MOCK=true` to return realistic bilingual (Arabic/English) dummy data for any uploaded
file. Use this to develop and test the NestJS integration and frontend without a GPU.

```bash
VLM_MOCK=true uvicorn app.main:app --host 0.0.0.0 --port 8100 --reload
```

Or export the variable and run without the prefix:

```bash
export VLM_MOCK=true
uvicorn app.main:app --host 0.0.0.0 --port 8100 --reload
```

### Real Mode — requires NVIDIA GPU

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8100 --workers 1
```

> **First run** downloads ~5 GB of model weights from HuggingFace automatically.
> For **offline / air-gapped** deployment, pre-download with:
>
> ```bash
> huggingface-cli download Qwen/Qwen2.5-VL-7B-Instruct-AWQ
> ```

---

## API Reference

### `POST /api/v1/process-invoice`

Extract structured data from an invoice image or PDF.

**Request** — `multipart/form-data`

| Field  | Type | Description                                      |
| ------ | ---- | ------------------------------------------------ |
| `file` | File | Invoice image or PDF (see supported types below) |

**Supported file types:** `image/jpeg`, `image/png`, `image/tiff`, `image/webp`, `application/pdf`
**Maximum file size:** 15 MB

**Example**

```bash
curl -X POST \
  -F "file=@invoice.jpg" \
  http://localhost:8100/api/v1/process-invoice
```

**Response**

```json
{
  "success": true,
  "data": {
    "vendor_name": "Al-Faisal Trading Co. / شركة الفيصل التجارية",
    "vendor_tax_id": "300123456789003",
    "invoice_number": "INV-2024-001234",
    "invoice_date": "2024-12-15",
    "due_date": "2025-01-14",
    "currency": "SAR",
    "subtotal": 5000.0,
    "tax_amount": 750.0,
    "total_amount": 5750.0,
    "items": [
      {
        "description": "Office Supplies",
        "quantity": 10,
        "unit_price": 300.0,
        "total": 3000.0,
        "tax_rate": 15.0
      }
    ],
    "accounting_entry": {
      "debit_account": "Office Supplies",
      "credit_account": "Accounts Payable",
      "tax_account": "Input VAT"
    },
    "confidence": {
      "overall": 0.95,
      "vendor_name": 0.98,
      "invoice_date": 0.92,
      "total_amount": 0.97,
      "line_items": 0.9
    },
    "processing_time_ms": 1240.5
  },
  "error": null
}
```

---

### `GET /api/v1/health`

Fast health check — used by NestJS health checks and Docker `HEALTHCHECK`. Never runs inference.

```bash
curl http://localhost:8100/api/v1/health
```

```json
{
  "status": "ok",
  "model_loaded": true,
  "model_name": "Qwen/Qwen2.5-VL-7B-Instruct-AWQ",
  "gpu_memory_used_mb": 5120.0,
  "gpu_memory_total_mb": 12288.0
}
```

---

### `GET /api/v1/model-status`

Detailed stats: VRAM usage, average inference latency, total requests processed.

```bash
curl http://localhost:8100/api/v1/model-status
```

```json
{
  "model_name": "Qwen/Qwen2.5-VL-7B-Instruct-AWQ",
  "model_loaded": true,
  "mock_mode": false,
  "total_requests": 42,
  "average_inference_ms": 1380.2,
  "gpu_memory_used_mb": 5120.0,
  "gpu_memory_total_mb": 12288.0
}
```

---

## Running Tests

Tests run entirely in **mock mode** — no GPU or model download required.

```bash
source venv/bin/activate
pytest tests/ -v
```

Test coverage:

- `test_health_returns_200` — health endpoint responds correctly
- `test_process_invoice_mock_returns_valid_structure` — full pipeline with a tiny JPEG
- `test_invalid_file_type_returns_400` — rejects `.txt`, `.csv`, etc.
- `test_file_too_large_returns_413` — rejects files > 15 MB
- `test_model_status_returns_expected_keys` — model-status endpoint shape
- `test_json_parser_direct` — parses clean JSON output
- `test_json_parser_markdown_fence` — extracts JSON from ` ```json ``` ` fences
- `test_json_parser_embedded_braces` — extracts JSON embedded in prose
- `test_json_parser_trailing_comma` — fixes trailing-comma JSON (LLM quirk)
- `test_json_parser_invalid_raises` — raises `ValueError` on unparseable output

---

## NVIDIA Container Toolkit Setup (Required for GPU Docker)

### Ubuntu/Debian

```bash
# Add NVIDIA GPG key and repo
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### Windows (Docker Desktop with WSL2)

- Install latest NVIDIA drivers for Windows
- Enable WSL2 in Docker Desktop settings
- GPU passthrough works automatically with Docker Desktop 4.x+ and WSL2

### Verify GPU access

```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

---

## Docker

### With Docker Compose (recommended)

From the project root:

```bash
# Start all services including VLM
docker compose up -d

# Or start only the VLM service
docker compose up -d vlm-service

# Watch logs during first run (model download ~5GB)
docker compose logs -f vlm-service

# Check health status
docker compose ps  # vlm-service should show "healthy"
```

The first `docker compose up vlm-service` will download the model (~5GB). This happens inside
the container and is cached in the `vlm_models` Docker volume. Subsequent starts are fast
(~30-60 seconds for model loading).

The `start_period: 300s` (5 minutes) in the health check allows time for the initial download
without Docker killing the container.

### Standalone Build

```bash
docker build -t mizano-vlm-service .
```

### Standalone Run with GPU

```bash
docker run --gpus all \
  -p 8100:8100 \
  -v /path/to/hf-models:/models \
  --env-file .env \
  mizano-vlm-service
```

Mount `/models` as a named volume so model weights persist across container restarts and don't
get re-downloaded every time.

### Run in mock mode (no GPU)

```bash
docker run -p 8100:8100 -e VLM_MOCK=true mizano-vlm-service
```

### Important Docker Notes

- The `vlm_models` volume persists across `docker compose down`. Only `docker compose down -v` will delete it (forcing a re-download).
- GPU memory is NOT shared between containers. Only one container should use the GPU at a time.
- The API uses `condition: service_started` (not `service_healthy`) to avoid blocking during model loading.
- If the GPU is insufficient, set `VLM_MOCK=true` and the system gracefully falls back to OCR.

---

## Environment Variables

| Variable               | Default                           | Description                                    |
| ---------------------- | --------------------------------- | ---------------------------------------------- |
| `MODEL_NAME`           | `Qwen/Qwen2.5-VL-7B-Instruct-AWQ` | HuggingFace model ID                           |
| `DEVICE`               | `cuda`                            | `cuda` or `cpu`                                |
| `MAX_NEW_TOKENS`       | `4096`                            | Max tokens generated per inference             |
| `TEMPERATURE`          | `0.1`                             | Low value = deterministic JSON output          |
| `TOP_P`                | `0.9`                             | Nucleus sampling threshold                     |
| `HOST`                 | `0.0.0.0`                         | Bind address                                   |
| `PORT`                 | `8100`                            | Listen port                                    |
| `LOG_LEVEL`            | `info`                            | `debug`, `info`, `warning`, `error`            |
| `VLM_MOCK`             | `false`                           | `true` = skip model load, return dummy data    |
| `MAX_IMAGE_RESOLUTION` | `1280`                            | Max pixels on the longest side before resizing |

---

## Project Structure

```
services/vlm-service/
├── Dockerfile                        # CUDA 12.4 runtime, Python 3.11, poppler
├── .dockerignore                     # Excludes venv, models, tests from image
├── requirements.txt                  # Python dependencies
├── pyproject.toml                    # Project metadata + pytest config
├── .env.example                      # All env vars with defaults
├── app/
│   ├── main.py                       # FastAPI app, lifespan, CORS
│   ├── config.py                     # Pydantic BaseSettings
│   ├── routers/
│   │   └── invoice.py                # POST /process-invoice, GET /health, GET /model-status
│   ├── services/
│   │   ├── vlm_engine.py             # Model load/unload, inference, mock mode
│   │   └── image_preprocessor.py    # PDF→PIL, EXIF orient, resize, RGB
│   ├── schemas/
│   │   └── invoice.py                # Pydantic response models
│   ├── prompts/
│   │   └── invoice_extraction.py    # Bilingual Arabic/English VLM prompt
│   └── utils/
│       └── json_parser.py            # 4-strategy JSON extraction from VLM output
└── tests/
    └── test_invoice_router.py        # Pytest tests (mock mode, no GPU needed)
```
