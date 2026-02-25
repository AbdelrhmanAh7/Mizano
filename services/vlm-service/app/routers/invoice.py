import logging
import time

from fastapi import APIRouter, HTTPException, Request, UploadFile

from app.config import get_settings
from app.routers.metrics import metrics
from app.schemas.invoice import (
    HealthResponse,
    InvoiceExtractionResult,
    ProcessInvoiceResponse,
)
from app.services.image_preprocessor import SUPPORTED_CONTENT_TYPES, ImagePreprocessor

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB


@router.post("/process-invoice", response_model=ProcessInvoiceResponse)
async def process_invoice(request: Request, file: UploadFile) -> ProcessInvoiceResponse:
    """Extract structured data from an invoice or bill image.

    Accepts multipart/form-data with a single ``file`` field.
    Supported formats: JPEG, PNG, TIFF, WebP, PDF.
    Maximum size: 15 MB.

    Returns a ``ProcessInvoiceResponse`` with ``success=True`` and the
    extracted data, or ``success=False`` with an error message on failure.
    """
    # --- Validate content type ---
    content_type = (file.content_type or "").lower().strip()
    if content_type not in SUPPORTED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type: '{content_type}'. "
                f"Allowed: {', '.join(sorted(SUPPORTED_CONTENT_TYPES))}"
            ),
        )

    # --- Read file bytes (check size) ---
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"File too large: {len(file_bytes) / 1024 / 1024:.1f} MB. "
                f"Maximum allowed size is 15 MB."
            ),
        )

    # --- Run the pipeline ---
    start_time = time.perf_counter()
    try:
        preprocessor = ImagePreprocessor()
        image = preprocessor.preprocess(file_bytes, content_type)

        vlm_engine = request.app.state.vlm_engine
        raw_result = await vlm_engine.extract_invoice(image)

        latency_ms = (time.perf_counter() - start_time) * 1000
        metrics.record(latency_ms, success=True)

        # Coerce the raw dict from the VLM into the typed Pydantic model
        extraction = InvoiceExtractionResult(**raw_result)
        # Override processing_time_ms with the wall-clock time of the full pipeline
        extraction.processing_time_ms = round(latency_ms, 2)

        logger.info(
            "Invoice processed: vendor=%r total=%s time=%.0f ms",
            extraction.vendor_name,
            extraction.total_amount,
            latency_ms,
        )
        return ProcessInvoiceResponse(success=True, data=extraction)

    except Exception as exc:
        latency_ms = (time.perf_counter() - start_time) * 1000
        metrics.record(latency_ms, success=False)
        logger.exception("Invoice processing failed: %s", exc)
        return ProcessInvoiceResponse(success=False, error=str(exc))


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    """Fast health check — used by NestJS health checks and Docker HEALTHCHECK.

    Never runs inference. Returns model status and GPU memory stats.
    """
    settings = get_settings()
    vlm_engine = request.app.state.vlm_engine
    gpu_stats = vlm_engine.get_gpu_stats()

    return HealthResponse(
        status="ok",
        model_loaded=vlm_engine.is_loaded,
        model_name=settings.MODEL_NAME,
        gpu_memory_used_mb=gpu_stats.get("gpu_memory_used_mb"),
        gpu_memory_total_mb=gpu_stats.get("gpu_memory_total_mb"),
    )


@router.get("/model-status")
async def model_status(request: Request) -> dict:
    """Detailed model statistics: VRAM usage, average inference time, request count."""
    settings = get_settings()
    vlm_engine = request.app.state.vlm_engine
    gpu_stats = vlm_engine.get_gpu_stats()

    return {
        "model_name": settings.MODEL_NAME,
        "model_loaded": vlm_engine.is_loaded,
        "mock_mode": settings.VLM_MOCK,
        "total_requests": vlm_engine.total_requests,
        "average_inference_ms": vlm_engine.average_inference_ms,
        **gpu_stats,
    }
