"""Field-level accuracy metrics for invoice extraction evaluation.

Provides fuzzy matching for text fields, tolerance-based matching for
numeric fields, and format-aware date matching.
"""

import re
from datetime import datetime

from rapidfuzz import fuzz


def fuzzy_match(predicted: str | None, expected: str | None, threshold: float = 0.7) -> float:
    """Fuzzy string match score for vendor names and text fields.

    Returns:
        Score between 0.0 and 1.0. Returns 1.0 if both are None.
    """
    if predicted is None and expected is None:
        return 1.0
    if predicted is None or expected is None:
        return 0.0

    # Normalize: strip, lowercase for comparison
    p = predicted.strip()
    e = expected.strip()

    if not p and not e:
        return 1.0
    if not p or not e:
        return 0.0

    # Try exact match first
    if p == e:
        return 1.0

    # Fuzzy ratio (0-100) → normalize to 0.0-1.0
    ratio = fuzz.ratio(p.lower(), e.lower()) / 100.0
    partial = fuzz.partial_ratio(p.lower(), e.lower()) / 100.0
    token_sort = fuzz.token_sort_ratio(p.lower(), e.lower()) / 100.0

    # Take the best score
    best = max(ratio, partial, token_sort)
    return best if best >= threshold else 0.0


def numeric_match(
    predicted: float | None,
    expected: float | None,
    tolerance: float = 0.01,
) -> float:
    """Numeric comparison with relative tolerance.

    Args:
        predicted: Predicted numeric value.
        expected: Expected numeric value.
        tolerance: Relative tolerance (0.01 = 1%).

    Returns:
        1.0 if within tolerance, 0.0 otherwise.
    """
    if predicted is None and expected is None:
        return 1.0
    if predicted is None or expected is None:
        return 0.0

    if expected == 0:
        return 1.0 if abs(predicted) < 0.01 else 0.0

    relative_error = abs(predicted - expected) / abs(expected)
    return 1.0 if relative_error <= tolerance else 0.0


def date_match(predicted: str | None, expected: str | None) -> float:
    """Date comparison with format normalization.

    Handles common date format variations (DD/MM/YYYY, MM/DD/YYYY, etc.)
    and normalizes to YYYY-MM-DD for comparison.

    Returns:
        1.0 if dates match, 0.0 otherwise.
    """
    if predicted is None and expected is None:
        return 1.0
    if predicted is None or expected is None:
        return 0.0

    p = _normalize_date(predicted.strip())
    e = _normalize_date(expected.strip())

    if p is None or e is None:
        # Fallback: string comparison
        return 1.0 if predicted.strip() == expected.strip() else 0.0

    return 1.0 if p == e else 0.0


def _normalize_date(date_str: str) -> str | None:
    """Try to parse a date string into YYYY-MM-DD format."""
    formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
        "%d.%m.%Y",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def exact_match(predicted: str | None, expected: str | None) -> float:
    """Exact string match for invoice numbers, currency codes, etc.

    Returns:
        1.0 if strings match (case-insensitive, stripped), 0.0 otherwise.
    """
    if predicted is None and expected is None:
        return 1.0
    if predicted is None or expected is None:
        return 0.0

    p = predicted.strip().lower()
    e = expected.strip().lower()

    return 1.0 if p == e else 0.0


def compute_single_sample_accuracy(predicted: dict, expected: dict) -> dict:
    """Compute per-field and overall accuracy for a single invoice extraction.

    Args:
        predicted: Predicted extraction result (VLM output).
        expected: Ground truth annotation.

    Returns:
        Dict with per-field scores and overall accuracy.
    """
    field_scores: dict[str, float] = {}

    # Text fields — fuzzy match
    field_scores["vendor_name"] = fuzzy_match(
        predicted.get("vendor_name"), expected.get("vendor_name")
    )

    # Exact match fields
    field_scores["invoice_number"] = exact_match(
        predicted.get("invoice_number"), expected.get("invoice_number")
    )
    field_scores["currency"] = exact_match(
        predicted.get("currency"), expected.get("currency")
    )

    # Date fields
    field_scores["invoice_date"] = date_match(
        predicted.get("invoice_date"), expected.get("invoice_date")
    )
    field_scores["due_date"] = date_match(
        predicted.get("due_date"), expected.get("due_date")
    )

    # Numeric fields
    field_scores["total_amount"] = numeric_match(
        predicted.get("total_amount"), expected.get("total_amount")
    )
    field_scores["subtotal"] = numeric_match(
        predicted.get("subtotal"), expected.get("subtotal")
    )
    field_scores["tax_amount"] = numeric_match(
        predicted.get("tax_amount"), expected.get("tax_amount")
    )

    # Only count fields that have ground truth values (non-None)
    scored_fields = {
        k: v
        for k, v in field_scores.items()
        if expected.get(k.replace("total_amount", "total_amount")
                       .replace("tax_amount", "tax_amount")) is not None
    }

    # Filter: only fields where expected is not None
    active_fields = {}
    field_to_gt_key = {
        "vendor_name": "vendor_name",
        "invoice_number": "invoice_number",
        "currency": "currency",
        "invoice_date": "invoice_date",
        "due_date": "due_date",
        "total_amount": "total_amount",
        "subtotal": "subtotal",
        "tax_amount": "tax_amount",
    }
    for field, score in field_scores.items():
        gt_key = field_to_gt_key.get(field, field)
        if expected.get(gt_key) is not None:
            active_fields[field] = score

    overall = sum(active_fields.values()) / len(active_fields) if active_fields else 0.0

    return {
        "per_field": field_scores,
        "active_fields": active_fields,
        "overall": overall,
    }
