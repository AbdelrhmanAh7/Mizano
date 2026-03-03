#!/usr/bin/env bash
# Full LoRA fine-tuning pipeline for Qwen2.5-VL invoice extraction.
#
# Usage:
#   cd services/vlm-service
#   bash training/scripts/run_full_pipeline.sh
#
# Prerequisites:
#   - NVIDIA GPU with 16GB+ VRAM
#   - Python 3.11+ with requirements.txt + requirements-training.txt installed
#   - test-data/ directory with invoice images
#   - ground-truth.ts annotations

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VLM_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$VLM_DIR"

# Activate venv if present and not already active
if [ -z "${VIRTUAL_ENV:-}" ] && [ -f "$VLM_DIR/venv/bin/activate" ]; then
    echo "Activating venv..."
    source "$VLM_DIR/venv/bin/activate"
fi

echo "============================================"
echo "Step 1/6: Bootstrap annotations"
echo "============================================"
python -m training.annotate.bootstrap_annotations

echo ""
echo "============================================"
echo "Step 2/6: Validate annotations"
echo "============================================"
python -m training.annotate.validate_annotations

echo ""
echo "============================================"
echo "Step 3/6: Prepare dataset"
echo "============================================"
python -m training.data.prepare_dataset

echo ""
echo "============================================"
echo "Step 4/6: Train LoRA adapter"
echo "============================================"
python -m training.train.train_lora

echo ""
echo "============================================"
echo "Step 5/6: Evaluate fine-tuned model"
echo "============================================"
python -m training.evaluate.evaluate

echo ""
echo "============================================"
echo "Step 6/6: Compare base vs fine-tuned"
echo "============================================"
python -m training.evaluate.compare_models

echo ""
echo "============================================"
echo "Pipeline complete!"
echo "============================================"
echo "Adapter saved to: adapters/final/"
echo "Results saved to: checkpoints/eval_results.json"
echo "Comparison saved to: checkpoints/comparison_results.json"
