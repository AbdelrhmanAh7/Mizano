"""Validate annotation completeness and field formats.

Usage:
    python -m training.annotate.validate_annotations
"""

import json
import re
import sys
from pathlib import Path

from training.config import ANNOTATIONS_JSON, TEST_DATA_DIR

ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CURRENCY_RE = re.compile(r"^[A-Z]{3}$")


def validate() -> bool:
    """Validate annotations/ground_truth.json. Returns True if all checks pass."""
    if not ANNOTATIONS_JSON.exists():
        print(f"ERROR: Annotations file not found: {ANNOTATIONS_JSON}", file=sys.stderr)
        print("Run: python -m training.annotate.bootstrap_annotations", file=sys.stderr)
        return False

    data = json.loads(ANNOTATIONS_JSON.read_text(encoding="utf-8"))
    entries = data.get("entries", [])
    errors: list[str] = []
    warnings: list[str] = []

    # Check that every test-data file has an annotation entry
    if TEST_DATA_DIR.exists():
        test_files = {f.name for f in TEST_DATA_DIR.iterdir() if f.is_file()}
        annotated_files = {e["file"] for e in entries}
        missing = test_files - annotated_files
        if missing:
            for f in sorted(missing):
                errors.append(f"No annotation for test-data file: {f}")

    for entry in entries:
        file_name = entry["file"]
        gt = entry.get("ground_truth", {})

        if entry.get("needs_manual_review"):
            warnings.append(f"[{file_name}] Needs manual review — skipping field validation")
            continue

        # Validate date formats
        for date_field in ["invoice_date", "due_date"]:
            val = gt.get(date_field)
            if val is not None and not ISO_DATE_RE.match(val):
                errors.append(f"[{file_name}] {date_field} is not YYYY-MM-DD: {val!r}")

        # Validate currency code
        currency = gt.get("currency")
        if currency is not None and not CURRENCY_RE.match(currency):
            errors.append(f"[{file_name}] Invalid currency code: {currency!r}")

        # Validate numeric consistency: subtotal + tax ≈ total
        subtotal = gt.get("subtotal")
        tax = gt.get("tax_amount")
        total = gt.get("total_amount")
        if subtotal is not None and tax is not None and total is not None:
            expected = round(subtotal + tax, 2)
            actual = round(total, 2)
            if abs(expected - actual) > 0.05:
                warnings.append(
                    f"[{file_name}] subtotal({subtotal}) + tax({tax}) = {expected} != total({total})"
                )

        # Check file exists in test-data
        if TEST_DATA_DIR.exists():
            file_path = TEST_DATA_DIR / file_name
            if not file_path.exists():
                errors.append(f"[{file_name}] File not found in test-data/")

        # Validate line items totals
        for i, item in enumerate(gt.get("items", [])):
            qty = item.get("quantity", 0)
            price = item.get("unit_price", 0)
            item_total = item.get("total", 0)
            expected_total = round(qty * price, 2)
            if abs(expected_total - round(item_total, 2)) > 0.05:
                warnings.append(
                    f"[{file_name}] Item {i}: qty({qty}) * price({price}) = {expected_total} != total({item_total})"
                )

    # Report
    print(f"Validated {len(entries)} annotation entries")
    if warnings:
        print(f"\n{len(warnings)} warning(s):")
        for w in warnings:
            print(f"  WARN: {w}")
    if errors:
        print(f"\n{len(errors)} error(s):")
        for e in errors:
            print(f"  ERROR: {e}")
        return False

    print("\nAll validations passed!")
    return True


def main() -> None:
    ok = validate()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
