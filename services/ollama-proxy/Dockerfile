FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi uvicorn httpx
COPY ollama_proxy.py .
ENV TUNNEL_URL_FILE=/data/ollama_tunnel_url
# WEBHOOK_SECRET has no default on purpose: the container refuses to start without it.
# Supply it at runtime (e.g. `docker run -e WEBHOOK_SECRET=...` or compose `environment:`).
ENV LISTEN_PORT=11434
EXPOSE 11434
CMD ["python3", "ollama_proxy.py"]
