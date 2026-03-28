"""
Ollama Tunnel Proxy — transparent reverse proxy to Colab-hosted Ollama.

Reads the current Cloudflare tunnel URL from a file and forwards all
Ollama API requests to it.  When the tunnel is down, returns 503.
"""

import json
import os
import time
from datetime import datetime, timezone

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TUNNEL_URL_FILE = os.environ.get("TUNNEL_URL_FILE", "/data/ollama_tunnel_url")
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "change-me")
LISTEN_PORT = int(os.environ.get("LISTEN_PORT", "11434"))

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

app = FastAPI(title="Ollama Tunnel Proxy", docs_url=None, redoc_url=None)


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

    return {
        "proxy": "running",
        "tunnel_url": tunnel_url or "NOT_CONFIGURED",
        "ollama_reachable": ollama_reachable,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---- Tunnel URL webhook ----------------------------------------------------


@app.post("/api/internal/tunnel-update")
async def tunnel_update(request: Request):
    body = await request.json()
    secret = body.get("secret", "")
    tunnel_url = body.get("tunnel_url", "")

    if secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    if not tunnel_url or not tunnel_url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Invalid tunnel URL")

    # Write to file
    os.makedirs(os.path.dirname(TUNNEL_URL_FILE), exist_ok=True)
    with open(TUNNEL_URL_FILE, "w") as f:
        f.write(tunnel_url)

    # Update in-memory cache immediately
    global _cached_url, _cached_url_ts
    _cached_url = tunnel_url
    _cached_url_ts = time.monotonic()

    return {"status": "ok", "tunnel_url": tunnel_url}


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

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if is_streaming:
                # Stream the response back chunk by chunk
                req = client.build_request(
                    method=request.method,
                    url=target,
                    headers=fwd_headers,
                    content=body,
                )
                upstream = await client.send(req, stream=True)

                async def stream_body():
                    try:
                        async for chunk in upstream.aiter_bytes():
                            yield chunk
                    finally:
                        await upstream.aclose()

                return StreamingResponse(
                    content=stream_body(),
                    status_code=upstream.status_code,
                    headers=_filtered_headers(upstream.headers),
                    media_type=upstream.headers.get("content-type", "application/x-ndjson"),
                )
            else:
                # Non-streaming: simple forward
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
    uvicorn.run(app, host="0.0.0.0", port=LISTEN_PORT)
