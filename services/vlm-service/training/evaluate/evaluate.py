"""Evaluate fine-tuned model on the test split.

Loads the base model + LoRA adapter, runs inference on each test sample,
and reports per-file, per-field accuracy.

Usage:
    python -m training.evaluate.evaluate
    python -m training.evaluate.evaluate --adapter-path adapters/final
"""

import argparse
import json
import logging
import sys
import time
from pathlib import Path

import torch
from PIL import Image, ImageOps
from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

from training.config import (
    CHECKPOINTS_DIR,
    FINAL_ADAPTER_DIR,
    MAX_IMAGE_RESOLUTION,
    MODEL_NAME,
)
from training.evaluate.metrics import compute_single_sample_accuracy

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def _load_model(adapter_path: Path | None = None):
    """Load base model, optionally with LoRA adapter merged in."""
    logger.info(f"Loading base model: {MODEL_NAME}")
    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        MODEL_NAME,
        device_map="auto",
        torch_dtype=torch.bfloat16,
    )
    processor = AutoProcessor.from_pretrained(MODEL_NAME)

    if adapter_path and adapter_path.exists():
        logger.info(f"Loading LoRA adapter from {adapter_path}")
        from peft import PeftModel

        model = PeftModel.from_pretrained(model, str(adapter_path))
        model = model.merge_and_unload()
        logger.info("LoRA adapter merged into base model")

    model.eval()
    return model, processor


def _load_image(image_path: str) -> Image.Image:
    """Load and preprocess image identically to training."""
    path = Path(image_path)
    suffix = path.suffix.lower()

    if suffix == ".heic":
        import pillow_heif
        pillow_heif.register_heif_opener()
        img = Image.open(path)
    elif suffix == ".pdf":
        from pdf2image import convert_from_path
        pages = convert_from_path(str(path), first_page=1, last_page=1, dpi=200)
        img = pages[0]
    else:
        img = Image.open(path)

    img = ImageOps.exif_transpose(img)
    w, h = img.size
    longest = max(w, h)
    if longest > MAX_IMAGE_RESOLUTION:
        scale = MAX_IMAGE_RESOLUTION / longest
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    if img.mode != "RGB":
        img = img.convert("RGB")
    return img


def _run_inference(model, processor, image: Image.Image, prompt: str) -> str:
    """Run single inference and return raw text output."""
    from qwen_vl_utils import process_vision_info

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": prompt},
            ],
        }
    ]

    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    image_inputs, video_inputs = process_vision_info(messages)
    inputs = processor(
        text=[text],
        images=image_inputs,
        videos=video_inputs,
        padding=True,
        return_tensors="pt",
    ).to(model.device)

    with torch.no_grad():
        generated_ids = model.generate(
            **inputs,
            max_new_tokens=4096,
            temperature=0.1,
            do_sample=False,
        )

    input_length = inputs["input_ids"].shape[1]
    output = processor.batch_decode(
        generated_ids[:, input_length:],
        skip_special_tokens=True,
        clean_up_tokenization_spaces=False,
    )[0]

    return output


def _load_prompt() -> str:
    """Load extraction prompt."""
    import ast
    prompt_path = Path(__file__).resolve().parent.parent.parent / "app" / "prompts" / "invoice_extraction.py"
    content = prompt_path.read_text(encoding="utf-8")
    tree = ast.parse(content)
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "INVOICE_EXTRACTION_PROMPT":
                    return ast.literal_eval(node.value)
    raise ValueError("Could not find INVOICE_EXTRACTION_PROMPT")


def evaluate(adapter_path: Path | None = None) -> dict:
    """Run evaluation on the test split.

    Returns:
        Dict with per-file and aggregate accuracy metrics.
    """
    # Load test data
    test_path = CHECKPOINTS_DIR / "dataset" / "test.json"
    if not test_path.exists():
        print("ERROR: Test dataset not found. Run: python -m training.data.prepare_dataset", file=sys.stderr)
        sys.exit(1)

    test_samples = json.loads(test_path.read_text(encoding="utf-8"))
    logger.info(f"Evaluating on {len(test_samples)} test samples")

    # Load model
    model, processor = _load_model(adapter_path)
    prompt = _load_prompt()

    # Run inference on each sample
    results = []
    for i, sample in enumerate(test_samples):
        file_name = sample["file"]
        image_path = sample["image_path"]
        gt_json_str = sample["conversations"][1]["content"][0]["text"]
        expected = json.loads(gt_json_str)

        logger.info(f"[{i + 1}/{len(test_samples)}] Processing {file_name}...")

        try:
            image = _load_image(image_path)
            start = time.perf_counter()
            raw_output = _run_inference(model, processor, image, prompt)
            elapsed_ms = (time.perf_counter() - start) * 1000

            # Parse predicted JSON
            from app.utils.json_parser import extract_json_from_vlm_output
            predicted = extract_json_from_vlm_output(raw_output)

            # Compute accuracy
            accuracy = compute_single_sample_accuracy(predicted, expected)

            results.append({
                "file": file_name,
                "accuracy": accuracy,
                "inference_time_ms": round(elapsed_ms, 1),
                "success": True,
            })

            logger.info(
                f"  Overall: {accuracy['overall']:.2%} | "
                f"Time: {elapsed_ms:.0f}ms | "
                f"Fields: {accuracy['active_fields']}"
            )

        except Exception as e:
            logger.error(f"  FAILED: {e}")
            results.append({
                "file": file_name,
                "accuracy": {"overall": 0.0, "per_field": {}, "active_fields": {}},
                "inference_time_ms": 0,
                "success": False,
                "error": str(e),
            })

    # Aggregate metrics
    successful = [r for r in results if r["success"]]
    if successful:
        avg_overall = sum(r["accuracy"]["overall"] for r in successful) / len(successful)
        avg_time = sum(r["inference_time_ms"] for r in successful) / len(successful)

        # Per-field aggregates
        field_scores: dict[str, list[float]] = {}
        for r in successful:
            for field, score in r["accuracy"]["active_fields"].items():
                field_scores.setdefault(field, []).append(score)

        field_averages = {
            field: sum(scores) / len(scores) for field, scores in field_scores.items()
        }
    else:
        avg_overall = 0.0
        avg_time = 0.0
        field_averages = {}

    summary = {
        "total_samples": len(results),
        "successful": len(successful),
        "failed": len(results) - len(successful),
        "average_overall_accuracy": round(avg_overall, 4),
        "average_inference_time_ms": round(avg_time, 1),
        "field_averages": field_averages,
        "per_file": results,
    }

    # Print summary
    print("\n" + "=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    print(f"Samples: {summary['total_samples']} ({summary['successful']} OK, {summary['failed']} failed)")
    print(f"Overall accuracy: {avg_overall:.2%}")
    print(f"Avg inference time: {avg_time:.0f} ms")
    print("\nPer-field accuracy:")
    for field, avg in sorted(field_averages.items()):
        print(f"  {field:20s}: {avg:.2%}")
    print("=" * 60)

    # Save results
    output_path = CHECKPOINTS_DIR / "eval_results.json"
    output_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info(f"Results saved to {output_path}")

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate fine-tuned model")
    parser.add_argument(
        "--adapter-path",
        type=str,
        default=str(FINAL_ADAPTER_DIR),
        help="Path to LoRA adapter directory",
    )
    args = parser.parse_args()

    adapter_path = Path(args.adapter_path)
    if not adapter_path.exists():
        logger.warning(f"Adapter path {adapter_path} not found — evaluating base model only")
        adapter_path = None

    evaluate(adapter_path)


if __name__ == "__main__":
    main()
