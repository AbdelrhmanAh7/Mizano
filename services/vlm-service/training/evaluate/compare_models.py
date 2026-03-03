"""A/B comparison: base model vs fine-tuned model.

Runs both models on the test split and produces a side-by-side report
showing improvements and regressions per field.

Usage:
    python -m training.evaluate.compare_models
    python -m training.evaluate.compare_models --adapter-path adapters/final/best
"""

import argparse
import json
import logging
import sys
from pathlib import Path

from training.config import CHECKPOINTS_DIR, FINAL_ADAPTER_DIR
from training.evaluate.evaluate import evaluate

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def compare(adapter_path: Path | None = None) -> dict:
    """Run A/B comparison between base and fine-tuned models."""
    adapter = adapter_path or FINAL_ADAPTER_DIR

    print("\n" + "=" * 70)
    print("PHASE 1: Evaluating BASE model (no LoRA)")
    print("=" * 70)
    base_results = evaluate(adapter_path=None)

    print("\n" + "=" * 70)
    print("PHASE 2: Evaluating FINE-TUNED model (with LoRA)")
    print("=" * 70)
    ft_results = evaluate(adapter_path=adapter)

    # Build comparison report
    print("\n" + "=" * 70)
    print("A/B COMPARISON REPORT")
    print("=" * 70)

    base_overall = base_results["average_overall_accuracy"]
    ft_overall = ft_results["average_overall_accuracy"]
    delta_overall = ft_overall - base_overall

    print(f"\nOverall accuracy:")
    print(f"  Base model:      {base_overall:.2%}")
    print(f"  Fine-tuned:      {ft_overall:.2%}")
    print(f"  Delta:           {delta_overall:+.2%} {'IMPROVED' if delta_overall > 0 else 'REGRESSED' if delta_overall < 0 else 'NO CHANGE'}")

    print(f"\nInference time:")
    print(f"  Base model:      {base_results['average_inference_time_ms']:.0f} ms")
    print(f"  Fine-tuned:      {ft_results['average_inference_time_ms']:.0f} ms")

    print(f"\nPer-field comparison:")
    print(f"  {'Field':<20} {'Base':>8} {'Fine-tuned':>12} {'Delta':>8} {'Status'}")
    print(f"  {'-' * 60}")

    all_fields = set(base_results.get("field_averages", {}).keys()) | set(
        ft_results.get("field_averages", {}).keys()
    )

    field_deltas = {}
    for field in sorted(all_fields):
        base_score = base_results.get("field_averages", {}).get(field, 0.0)
        ft_score = ft_results.get("field_averages", {}).get(field, 0.0)
        delta = ft_score - base_score
        field_deltas[field] = delta

        status = "IMPROVED" if delta > 0.01 else "REGRESSED" if delta < -0.01 else "SAME"
        indicator = "+" if delta > 0 else ""
        print(f"  {field:<20} {base_score:>7.1%} {ft_score:>11.1%} {indicator}{delta:>7.1%} {status}")

    # Per-file comparison
    print(f"\nPer-file comparison:")
    base_by_file = {r["file"]: r for r in base_results.get("per_file", [])}
    ft_by_file = {r["file"]: r for r in ft_results.get("per_file", [])}

    for file_name in sorted(set(base_by_file.keys()) | set(ft_by_file.keys())):
        base_acc = base_by_file.get(file_name, {}).get("accuracy", {}).get("overall", 0.0)
        ft_acc = ft_by_file.get(file_name, {}).get("accuracy", {}).get("overall", 0.0)
        delta = ft_acc - base_acc
        indicator = "+" if delta > 0 else ""
        status = "IMPROVED" if delta > 0.01 else "REGRESSED" if delta < -0.01 else "SAME"
        print(f"  {file_name:<45} {base_acc:>6.1%} → {ft_acc:>6.1%} ({indicator}{delta:.1%}) {status}")

    print("=" * 70)

    # Save comparison
    comparison = {
        "base_model": base_results,
        "fine_tuned": ft_results,
        "overall_delta": delta_overall,
        "field_deltas": field_deltas,
    }

    output_path = CHECKPOINTS_DIR / "comparison_results.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(comparison, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info(f"Comparison saved to {output_path}")

    return comparison


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare base vs fine-tuned model")
    parser.add_argument(
        "--adapter-path",
        type=str,
        default=None,
        help="Path to LoRA adapter (default: adapters/final)",
    )
    args = parser.parse_args()

    adapter = Path(args.adapter_path) if args.adapter_path else None
    compare(adapter)


if __name__ == "__main__":
    main()
