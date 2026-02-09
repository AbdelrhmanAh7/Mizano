#!/bin/bash
set -e

# PaddleOCR ONNX Model Download Script
# This script downloads pre-converted ONNX models for PaddleOCR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"
MODELS_DIR="$API_DIR/ml-models/paddle-ocr"

echo "========================================="
echo "PaddleOCR ONNX Model Downloader"
echo "========================================="
echo ""

# Create models directory
mkdir -p "$MODELS_DIR"

# Download detection model (en_PP-OCRv3_det)
echo "[1/2] Downloading text detection model..."
if [ -f "$MODELS_DIR/en_det_infer.onnx" ]; then
  echo "  ✓ Detection model already exists, skipping..."
else
  # PaddleOCR ONNX models from official repo
  # Note: These are placeholder URLs - you'll need to use actual ONNX export
  curl -L "https://paddleocr.bj.bcebos.com/PP-OCRv3/english/en_PP-OCRv3_det_infer.tar" \
    -o "$MODELS_DIR/det_model.tar"

  # Extract and convert (if tar contains paddle model, need conversion)
  cd "$MODELS_DIR"
  tar -xf det_model.tar

  echo "  → Detection model requires ONNX conversion"
  echo "  → Please follow conversion instructions in README"

  rm det_model.tar
fi

# Download recognition model (en_PP-OCRv3_rec)
echo "[2/2] Downloading text recognition model..."
if [ -f "$MODELS_DIR/en_rec_infer.onnx" ]; then
  echo "  ✓ Recognition model already exists, skipping..."
else
  curl -L "https://paddleocr.bj.bcebos.com/PP-OCRv3/english/en_PP-OCRv3_rec_infer.tar" \
    -o "$MODELS_DIR/rec_model.tar"

  cd "$MODELS_DIR"
  tar -xf rec_model.tar

  echo "  → Recognition model requires ONNX conversion"
  echo "  → Please follow conversion instructions in README"

  rm rec_model.tar
fi

echo ""
echo "========================================="
echo "⚠️  Model Conversion Required"
echo "========================================="
echo ""
echo "The downloaded models are in PaddlePaddle format."
echo "You need to convert them to ONNX format:"
echo ""
echo "1. Install paddle2onnx:"
echo "   pip install paddle2onnx"
echo ""
echo "2. Convert detection model:"
echo "   paddle2onnx \\"
echo "     --model_dir $MODELS_DIR/en_PP-OCRv3_det_infer \\"
echo "     --model_filename inference.pdmodel \\"
echo "     --params_filename inference.pdiparams \\"
echo "     --save_file $MODELS_DIR/en_det_infer.onnx \\"
echo "     --opset_version 11"
echo ""
echo "3. Convert recognition model:"
echo "   paddle2onnx \\"
echo "     --model_dir $MODELS_DIR/en_PP-OCRv3_rec_infer \\"
echo "     --model_filename inference.pdmodel \\"
echo "     --params_filename inference.pdiparams \\"
echo "     --save_file $MODELS_DIR/en_rec_infer.onnx \\"
echo "     --opset_version 11"
echo ""
echo "Alternatively, use pre-converted ONNX models from:"
echo "https://github.com/PaddlePaddle/PaddleOCR/tree/main/deploy/paddle2onnx"
echo ""
