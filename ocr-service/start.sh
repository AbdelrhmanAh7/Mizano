#!/bin/bash
set -e

echo "=== Mizano OCR Service Startup ==="

# Check for Tesseract
if command -v tesseract &> /dev/null; then
    TESS_VERSION=$(tesseract --version 2>&1 | head -1)
    echo "✓ Tesseract found: $TESS_VERSION"
else
    echo "✗ Tesseract not found. Installing..."
    if command -v apt-get &> /dev/null; then
        apt-get update && apt-get install -y tesseract-ocr tesseract-ocr-eng
    elif command -v brew &> /dev/null; then
        brew install tesseract
    else
        echo "ERROR: Cannot install Tesseract automatically. Please install it manually."
        echo "  Ubuntu/Debian: sudo apt-get install tesseract-ocr tesseract-ocr-eng"
        echo "  macOS: brew install tesseract"
        echo "  Windows: Download from https://github.com/UB-Mannheim/tesseract/wiki"
        exit 1
    fi
fi

# Check for tessdata_best (high-accuracy models)
TESSDATA_DIR="${TESSDATA_PREFIX:-/usr/share/tesseract-ocr/5/tessdata}"
if [ ! -d "$TESSDATA_DIR" ]; then
    TESSDATA_DIR="${TESSDATA_PREFIX:-/usr/share/tesseract-ocr/4.00/tessdata}"
fi
if [ ! -d "$TESSDATA_DIR" ]; then
    TESSDATA_DIR="$(dirname $(which tesseract 2>/dev/null || echo '/usr/bin/tesseract'))/../share/tessdata"
fi

BEST_ENG="$TESSDATA_DIR/eng.traineddata"
if [ -f "$BEST_ENG" ]; then
    echo "✓ English traineddata found at $BEST_ENG"
else
    echo "Downloading tessdata_best/eng.traineddata..."
    mkdir -p "$TESSDATA_DIR"
    curl -L -o "$BEST_ENG" \
        "https://github.com/tesseract-ocr/tessdata_best/raw/main/eng.traineddata" 2>/dev/null \
        || wget -O "$BEST_ENG" \
        "https://github.com/tesseract-ocr/tessdata_best/raw/main/eng.traineddata" 2>/dev/null \
        || echo "WARNING: Could not download tessdata_best. Using default tessdata."
fi

# Check Python dependencies
echo "Checking Python dependencies..."
python3 -c "import paddleocr; print('✓ PaddleOCR available')" 2>/dev/null || echo "✗ PaddleOCR not available (install with: pip install paddleocr paddlepaddle)"
python3 -c "import pytesseract; print('✓ pytesseract available')" 2>/dev/null || echo "✗ pytesseract not available"
python3 -c "import cv2; print('✓ OpenCV available')" 2>/dev/null || echo "✗ OpenCV not available"
python3 -c "import fitz; print('✓ PyMuPDF available')" 2>/dev/null || echo "✗ PyMuPDF not available (PDF support disabled)"

# Start the service
PORT="${OCR_SERVICE_PORT:-7001}"
echo ""
echo "Starting OCR service on port $PORT..."
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers 1 --log-level info
