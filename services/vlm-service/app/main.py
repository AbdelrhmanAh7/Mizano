import logging
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers.invoice import router as invoice_router
from app.routers.metrics import router as metrics_router
from app.services.vlm_engine import create_engine

settings = get_settings()

logging.basicConfig(
    level=settings.LOG_LEVEL.upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Load the VLM model once at startup; unload it cleanly on shutdown."""
    startup_start = time.perf_counter()
    logger.info("Starting Mizano VLM Service …")

    engine = create_engine(settings)
    await engine.load_model()
    app.state.vlm_engine = engine

    startup_elapsed = time.perf_counter() - startup_start
    gpu_stats = engine.get_gpu_stats()

    logger.info(
        "VLM Service ready in %.1f s. Engine: %s. Mock: %s. GPU VRAM: %s MB / %s MB",
        startup_elapsed,
        settings.ENGINE,
        settings.VLM_MOCK,
        gpu_stats.get("gpu_memory_used_mb", "N/A"),
        gpu_stats.get("gpu_memory_total_mb", "N/A"),
    )

    yield  # Application runs here

    logger.info("Shutting down VLM Service …")
    await engine.unload_model()
    logger.info("VLM Service stopped.")


app = FastAPI(
    title="Mizano VLM Service",
    description=(
        "Local Vision-Language Model microservice for invoice and bill data extraction. "
        "Uses Qwen2.5-VL-7B-Instruct-AWQ for 100% local, zero-API-call inference."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Allow all origins for development; restrict in production via a reverse proxy.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(invoice_router, prefix="/api/v1")
app.include_router(metrics_router, prefix="/api/v1")
