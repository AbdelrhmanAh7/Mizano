"""
Tests for the VLM service invoice router and JSON parser utility.

All tests run in mock mode (VLM_MOCK=True) — no GPU or model required.
The async test client uses httpx's AsyncClient with the ASGI transport.
"""

import io
import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from PIL import Image

# Set mock mode BEFORE importing the app so config is resolved correctly.
os.environ["VLM_MOCK"] = "true"

from app.main import app  # noqa: E402  (import after env setup)
from app.utils.json_parser import extract_json_from_vlm_output  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client():
    """Async HTTP client wired to the FastAPI ASGI app."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


def _make_jpeg_bytes(width: int = 10, height: int = 10) -> bytes:
    """Create a minimal valid JPEG image in memory."""
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_returns_200(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["model_loaded"] is True  # mock mode reports as loaded
    assert "model_name" in body


# ---------------------------------------------------------------------------
# Invoice processing — happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_process_invoice_mock_returns_valid_structure(
    client: AsyncClient,
) -> None:
    jpeg_bytes = _make_jpeg_bytes()
    response = await client.post(
        "/api/v1/process-invoice",
        files={"file": ("invoice.jpg", jpeg_bytes, "image/jpeg")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    data = body["data"]
    assert data is not None
    assert data["vendor_name"] is not None
    assert data["total_amount"] is not None
    assert isinstance(data["items"], list)
    assert len(data["items"]) > 0
    assert data["confidence"]["overall"] > 0
    assert data["processing_time_ms"] >= 0


# ---------------------------------------------------------------------------
# Validation — unsupported file type
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invalid_file_type_returns_400(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/process-invoice",
        files={"file": ("document.txt", b"hello world", "text/plain")},
    )
    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Validation — file too large
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_file_too_large_returns_413(client: AsyncClient) -> None:
    # 16 MB of zero bytes posed as JPEG
    large_bytes = b"\x00" * (16 * 1024 * 1024)
    response = await client.post(
        "/api/v1/process-invoice",
        files={"file": ("big.jpg", large_bytes, "image/jpeg")},
    )
    assert response.status_code == 413
    assert "too large" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Model status endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_model_status_returns_expected_keys(client: AsyncClient) -> None:
    response = await client.get("/api/v1/model-status")
    assert response.status_code == 200
    body = response.json()
    assert "model_name" in body
    assert "total_requests" in body
    assert "average_inference_ms" in body
    assert "mock_mode" in body


# ---------------------------------------------------------------------------
# JSON parser — unit tests (no HTTP)
# ---------------------------------------------------------------------------


def test_json_parser_direct() -> None:
    raw = '{"vendor_name": "Acme Corp", "total_amount": 100.0}'
    result = extract_json_from_vlm_output(raw)
    assert result["vendor_name"] == "Acme Corp"
    assert result["total_amount"] == 100.0


def test_json_parser_markdown_fence() -> None:
    raw = '```json\n{"vendor_name": "Acme Corp", "total_amount": 200.0}\n```'
    result = extract_json_from_vlm_output(raw)
    assert result["vendor_name"] == "Acme Corp"
    assert result["total_amount"] == 200.0


def test_json_parser_embedded_braces() -> None:
    raw = 'Here is the extracted data: {"vendor_name": "Beta Ltd", "total_amount": 50.0} Hope that helps!'
    result = extract_json_from_vlm_output(raw)
    assert result["vendor_name"] == "Beta Ltd"


def test_json_parser_invalid_raises() -> None:
    with pytest.raises(ValueError):
        extract_json_from_vlm_output("this is not JSON at all !!!")


def test_json_parser_empty_raises() -> None:
    with pytest.raises(ValueError):
        extract_json_from_vlm_output("")


def test_json_parser_trailing_comma() -> None:
    # Strategy 4: fix trailing comma
    raw = '{"vendor_name": "Gamma Inc", "total_amount": 75.0,}'
    result = extract_json_from_vlm_output(raw)
    assert result["vendor_name"] == "Gamma Inc"
