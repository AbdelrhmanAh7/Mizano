FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi uvicorn httpx
COPY ollama_proxy.py .
ENV TUNNEL_URL_FILE=/data/ollama_tunnel_url
ENV WEBHOOK_SECRET=change-me
ENV LISTEN_PORT=11434
EXPOSE 11434
CMD ["python3", "ollama_proxy.py"]
