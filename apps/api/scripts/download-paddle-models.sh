#!/bin/bash
set -e

# Download Pre-converted PaddleOCR ONNX Models from HuggingFace
# Source: deepghs/paddleocr repository (Apache 2.0 License)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"
MODELS_DIR="$API_DIR/ml-models/paddle-ocr"

echo "========================================="
echo "PaddleOCR ONNX Model Downloader"
echo "========================================="
echo ""
echo "Downloading pre-converted ONNX models from HuggingFace..."
echo "Repository: deepghs/paddleocr (Apache 2.0 License)"
echo ""

# Create models directory
mkdir -p "$MODELS_DIR"
cd "$MODELS_DIR"

# Download English Detection Model (PP-OCRv3)
echo "[1/2] Downloading English detection model..."
if [ -f "en_det_infer.onnx" ]; then
  echo "  ✓ Detection model already exists, skipping..."
else
  curl -L "https://huggingface.co/deepghs/paddleocr/resolve/main/det/en_PP-OCRv3_det/model.onnx" \
    -o "en_det_infer.onnx" \
    --progress-bar

  if [ -f "en_det_infer.onnx" ]; then
    FILE_SIZE=$(ls -lh en_det_infer.onnx | awk '{print $5}')
    echo "  ✓ Detection model downloaded successfully ($FILE_SIZE)"
  else
    echo "  ✗ Failed to download detection model"
    exit 1
  fi
fi

# Download English Recognition Model (PP-OCRv3)
echo ""
echo "[2/2] Downloading English recognition model..."
if [ -f "en_rec_infer.onnx" ]; then
  echo "  ✓ Recognition model already exists, skipping..."
else
  curl -L "https://huggingface.co/deepghs/paddleocr/resolve/main/rec/en_PP-OCRv3_rec/model.onnx" \
    -o "en_rec_infer.onnx" \
    --progress-bar

  if [ -f "en_rec_infer.onnx" ]; then
    FILE_SIZE=$(ls -lh en_rec_infer.onnx | awk '{print $5}')
    echo "  ✓ Recognition model downloaded successfully ($FILE_SIZE)"
  else
    echo "  ✗ Failed to download recognition model"
    exit 1
  fi
fi

echo ""
echo "========================================="
echo "✓ Download Complete!"
echo "========================================="
echo ""
echo "Models saved to: $MODELS_DIR"
echo ""
echo "Files:"
ls -lh "$MODELS_DIR"/*.onnx 2>/dev/null || echo "  No ONNX files found"
echo ""
echo "Next steps:"
echo "  1. Start the API: pnpm dev"
echo "  2. Look for: [PaddleOcrService] PaddleOCR models loaded successfully"
echo ""
echo "Source: https://huggingface.co/deepghs/paddleocr (Apache 2.0)"
echo ""
