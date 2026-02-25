import time

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse

from app.config import get_settings

router = APIRouter()


class InferenceMetrics:
    """In-memory inference metrics (reset on restart)."""

    def __init__(self) -> None:
        self.total_requests: int = 0
        self.total_errors: int = 0
        self.latencies: list[float] = []  # Last 100 latencies in ms
        self.start_time: float = time.time()

    def record(self, latency_ms: float, success: bool) -> None:
        self.total_requests += 1
        if not success:
            self.total_errors += 1
        self.latencies.append(latency_ms)
        if len(self.latencies) > 100:
            self.latencies = self.latencies[-100:]

    @property
    def avg_latency_ms(self) -> float:
        return sum(self.latencies) / len(self.latencies) if self.latencies else 0

    @property
    def p95_latency_ms(self) -> float:
        if not self.latencies:
            return 0
        sorted_l = sorted(self.latencies)
        idx = int(len(sorted_l) * 0.95)
        return sorted_l[min(idx, len(sorted_l) - 1)]

    @property
    def uptime_seconds(self) -> float:
        return time.time() - self.start_time


metrics = InferenceMetrics()


@router.get("/metrics")
async def get_metrics(request: Request) -> dict:
    """Return inference metrics in JSON format."""
    settings = get_settings()
    return {
        "total_requests": metrics.total_requests,
        "total_errors": metrics.total_errors,
        "success_rate": (
            (metrics.total_requests - metrics.total_errors) / metrics.total_requests * 100
            if metrics.total_requests > 0
            else 100.0
        ),
        "avg_latency_ms": round(metrics.avg_latency_ms, 1),
        "p95_latency_ms": round(metrics.p95_latency_ms, 1),
        "uptime_seconds": round(metrics.uptime_seconds, 1),
        "engine": settings.ENGINE if not settings.VLM_MOCK else "mock",
    }


@router.get("/metrics/prometheus")
async def get_prometheus_metrics() -> PlainTextResponse:
    """Return metrics in Prometheus text format."""
    lines = [
        "# HELP vlm_requests_total Total number of inference requests",
        "# TYPE vlm_requests_total counter",
        f"vlm_requests_total {metrics.total_requests}",
        "# HELP vlm_errors_total Total number of failed requests",
        "# TYPE vlm_errors_total counter",
        f"vlm_errors_total {metrics.total_errors}",
        "# HELP vlm_latency_avg_ms Average inference latency in milliseconds",
        "# TYPE vlm_latency_avg_ms gauge",
        f"vlm_latency_avg_ms {metrics.avg_latency_ms:.1f}",
        "# HELP vlm_latency_p95_ms P95 inference latency in milliseconds",
        "# TYPE vlm_latency_p95_ms gauge",
        f"vlm_latency_p95_ms {metrics.p95_latency_ms:.1f}",
        "# HELP vlm_uptime_seconds Service uptime in seconds",
        "# TYPE vlm_uptime_seconds gauge",
        f"vlm_uptime_seconds {metrics.uptime_seconds:.1f}",
    ]
    return PlainTextResponse("\n".join(lines) + "\n", media_type="text/plain")
