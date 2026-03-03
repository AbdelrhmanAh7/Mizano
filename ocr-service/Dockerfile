FROM python:3.11-slim

# System dependencies for Tesseract + OpenCV (headless)
# Note: opencv-python-headless does NOT need libgl/X11 libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Download tessdata_best for maximum accuracy (overwrite default eng.traineddata)
RUN TESS_DIR=$(find /usr/share/tesseract-ocr -name tessdata -type d | head -1) && \
    echo "Detected tessdata at: $TESS_DIR" && \
    curl -L -o "$TESS_DIR/eng.traineddata" \
    https://github.com/tesseract-ocr/tessdata_best/raw/main/eng.traineddata

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

EXPOSE 7001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:7001/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7001", "--workers", "1"]
