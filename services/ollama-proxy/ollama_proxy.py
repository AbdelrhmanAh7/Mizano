"""
Ollama Tunnel Proxy — transparent reverse proxy to Colab-hosted Ollama.

Reads the current Cloudflare tunnel URL from a file and forwards all
Ollama API requests to it.  When the tunnel is down, returns 503.
"""

import hashlib
import hmac
import json
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TUNNEL_URL_FILE = os.environ.get("TUNNEL_URL_FILE", "/data/ollama_tunnel_url")
LISTEN_PORT = int(os.environ.get("LISTEN_PORT", "11434"))

# Known placeholder values that must never be accepted as a real secret.
_PLACEHOLDER_SECRETS = frozenset({"change-me", "changeme", "__change_me__", "secret", "password"})

# There is deliberately NO default: without a real secret the tunnel-update webhook cannot be
# authenticated, so the proxy refuses to start (see `require_webhook_secret`).
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "").strip()


def webhook_secret_is_usable(secret: str) -> bool:
    """A usable secret is non-empty and not a well-known placeholder."""
    return bool(secret) and secret.lower() not in _PLACEHOLDER_SECRETS


def require_webhook_secret() -> None:
    """Refuse to run without a real WEBHOOK_SECRET."""
    if not webhook_secret_is_usable(WEBHOOK_SECRET):
        raise RuntimeError(
            "WEBHOOK_SECRET is not set (or is a placeholder). Refusing to start: "
            "set a long random value for the tunnel-update webhook."
        )


def secrets_match(provided: object, expected: str) -> bool:
    """Constant-time secret comparison.

    Both values are hashed first so `hmac.compare_digest` always sees equal-length inputs,
    which also avoids leaking the expected secret's length. Non-string input never matches.
    """
    if not isinstance(provided, str) or not expected:
        return False
    provided_digest = hashlib.sha256(provided.encode("utf-8")).digest()
    expected_digest = hashlib.sha256(expected.encode("utf-8")).digest()
    return hmac.compare_digest(provided_digest, expected_digest)

# Timeouts (seconds)
CONNECT_TIMEOUT = 15.0
LONG_TIMEOUT = 300.0  # generate / chat / embed
DEFAULT_TIMEOUT = 60.0

# Tunnel URL in-memory cache
_cached_url: str | None = None
_cached_url_ts: float = 0.0
_CACHE_TTL = 5.0  # re-read file at most every 5 s

# Endpoints that can stream and need long timeouts
LONG_ENDPOINTS = {"/api/generate", "/api/chat", "/api/embed"}

# Hop-by-hop headers that must NOT be forwarded
HOP_BY_HOP = frozenset(
    {
        "host",
        "transfer-encoding",
        "connection",
        "content-encoding",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "upgrade",
    }
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _read_tunnel_url() -> str | None:
    """Return the tunnel URL from the file, with a 5 s in-memory cache."""
    global _cached_url, _cached_url_ts
    now = time.monotonic()
    if _cached_url is not None and (now - _cached_url_ts) < _CACHE_TTL:
        return _cached_url
    try:
        with open(TUNNEL_URL_FILE, "r") as f:
            url = f.read().strip()
        if url:
            _cached_url = url
            _cached_url_ts = now
            return url
    except FileNotFoundError:
        pass
    return _cached_url  # stale is better than nothing


def _filtered_headers(headers: httpx.Headers) -> dict[str, str]:
    """Strip hop-by-hop headers from an upstream response."""
    return {k: v for k, v in headers.items() if k.lower() not in HOP_BY_HOP}


def _timeout_for(path: str) -> httpx.Timeout:
    read = LONG_TIMEOUT if path in LONG_ENDPOINTS else DEFAULT_TIMEOUT
    return httpx.Timeout(connect=CONNECT_TIMEOUT, read=read, write=read, pool=read)


def _unavailable() -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"error": "AI temporarily unavailable. Ollama server is offline."},
    )


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

@asynccontextmanager
async def _lifespan(_app: FastAPI):
    # Fail fast at startup (also when launched via `uvicorn ollama_proxy:app`).
    require_webhook_secret()
    yield


app = FastAPI(title="Ollama Tunnel Proxy", docs_url=None, redoc_url=None, lifespan=_lifespan)


# ---- Health ----------------------------------------------------------------


@app.get("/health")
async def health():
    tunnel_url = _read_tunnel_url()
    ollama_reachable = False

    if tunnel_url:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(f"{tunnel_url}/api/version")
                ollama_reachable = r.status_code == 200
        except Exception:
            pass

    # The tunnel URL is an access path to the model host: report only whether one is configured.
    return {
        "proxy": "running",
        "tunnel_configured": bool(tunnel_url),
        "ollama_reachable": ollama_reachable,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---- Tunnel URL webhook ----------------------------------------------------


@app.post("/api/internal/tunnel-update")
async def tunnel_update(request: Request):
    # No usable secret configured: nobody can be authenticated, so reject every request.
    if not webhook_secret_is_usable(WEBHOOK_SECRET):
        raise HTTPException(status_code=503, detail="Webhook secret is not configured")

    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not secrets_match(body.get("secret"), WEBHOOK_SECRET):
        raise HTTPException(status_code=403, detail="Forbidden")

    tunnel_url = body.get("tunnel_url", "")
    if not isinstance(tunnel_url, str) or not tunnel_url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Invalid tunnel URL")

    # Write to file (private: it holds the access path to the model host)
    directory = os.path.dirname(TUNNEL_URL_FILE)
    if directory:
        os.makedirs(directory, exist_ok=True)
    descriptor = os.open(TUNNEL_URL_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as f:
        f.write(tunnel_url)

    # Update in-memory cache immediately
    global _cached_url, _cached_url_ts
    _cached_url = tunnel_url
    _cached_url_ts = time.monotonic()

    return {"status": "ok"}


# ---- Catch-all proxy -------------------------------------------------------


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"])
async def proxy(request: Request, path: str):
    tunnel_url = _read_tunnel_url()
    if not tunnel_url:
        return _unavailable()

    target = f"{tunnel_url}/{path}"
    timeout = _timeout_for(f"/{path}")

    # Read request body (may be empty for GET / HEAD)
    body = await request.body()

    # Determine if this is a streaming request
    is_streaming = False
    if body and path in ("api/generate", "api/chat"):
        try:
            parsed = json.loads(body)
            # Ollama streams by default; only non-streaming if explicitly false
            is_streaming = parsed.get("stream", True) is not False
        except (json.JSONDecodeError, AttributeError):
            pass

    # Forward headers (strip hop-by-hop)
    fwd_headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in HOP_BY_HOP
    }
    # Add ngrok skip header in case tunnel is ngrok
    fwd_headers["ngrok-skip-browser-warning"] = "true"

    if is_streaming:
        # Streaming: keep client alive for the duration of the response.
        # Do NOT use `async with` — the client must outlive this function
        # so FastAPI can consume the generator after we return.
        try:
            client = httpx.AsyncClient(timeout=timeout)
            req = client.build_request(
                method=request.method,
                url=target,
                headers=fwd_headers,
                content=body,
            )
            upstream = await client.send(req, stream=True)
        except httpx.ConnectError:
            return _unavailable()
        except httpx.TimeoutException:
            return JSONResponse(
                status_code=504,
                content={"error": "Ollama request timed out. The GPU server may be overloaded."},
            )
        except Exception:
            return _unavailable()

        async def stream_body():
            try:
                async for chunk in upstream.aiter_bytes():
                    yield chunk
            finally:
                await upstream.aclose()
                await client.aclose()

        return StreamingResponse(
            content=stream_body(),
            status_code=upstream.status_code,
            headers=_filtered_headers(upstream.headers),
            media_type=upstream.headers.get("content-type", "application/x-ndjson"),
        )
    else:
        # Non-streaming: simple forward
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.request(
                    method=request.method,
                    url=target,
                    headers=fwd_headers,
                    content=body,
                )
                return Response(
                    content=resp.content,
                    status_code=resp.status_code,
                    headers=_filtered_headers(resp.headers),
                    media_type=resp.headers.get("content-type", "application/json"),
                )
        except httpx.ConnectError:
            return _unavailable()
        except httpx.TimeoutException:
            return JSONResponse(
                status_code=504,
                content={"error": "Ollama request timed out. The GPU server may be overloaded."},
            )
        except Exception:
            return _unavailable()


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    require_webhook_secret()
    uvicorn.run(app, host="0.0.0.0", port=LISTEN_PORT)
