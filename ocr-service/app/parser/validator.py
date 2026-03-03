"""Mathematical cross-validation for extracted invoice data."""

from __future__ import annotations

import logging
from typing import Optional

from app.models.schemas import LineItem, OcrExtractionResult, ValidationCheck, ValidationResult

logger = logging.getLogger(__name__)

TOLERANCE = 0.02  # ±2 cents tolerance for floating point comparisons


def _approx_eq(a: Optional[float], b: Optional[float], tol: float = TOLERANCE) -> bool:
    """Check if two values are approximately equal."""
    if a is None or b is None:
        return False
    return abs(a - b) <= tol + tol * max(abs(a), abs(b)) * 0.001


def validate_and_correct(result: OcrExtractionResult) -> OcrExtractionResult:
    """Run all validation checks and attempt auto-corrections."""
    checks: list[ValidationCheck] = []
    corrections: list[str] = []

    # --- 1. Line item math: qty × rate ≈ line_total ---
    for item in result.line_items:
        expected = item.quantity * item.unit_price
        if item.line_total > 0 and item.unit_price > 0 and item.quantity > 0:
            if _approx_eq(expected, item.line_total):
                checks.append(ValidationCheck(
                    name=f"line_{item.line_number}_qty_x_rate",
                    passed=True,
                    detail=f"Line {item.line_number}: {item.quantity} × {item.unit_price} = {expected:.2f} ≈ {item.line_total:.2f}",
                ))
            else:
                # Attempt correction: maybe rate is missing decimal
                corrected = False
                for divisor in (100, 10, 1000):
                    corrected_rate = item.unit_price / divisor
                    if _approx_eq(item.quantity * corrected_rate, item.line_total):
                        old_rate = item.unit_price
                        item.unit_price = corrected_rate
                        corrections.append(
                            f"Line {item.line_number}: corrected rate {old_rate} → {corrected_rate} (divided by {divisor})"
                        )
                        corrected = True
                        break

                if not corrected and item.unit_price > 0:
                    # Try correcting quantity
                    corrected_qty = item.line_total / item.unit_price
                    if corrected_qty > 0 and abs(corrected_qty - round(corrected_qty, 2)) < 0.005:
                        old_qty = item.quantity
                        item.quantity = round(corrected_qty, 4)
                        corrections.append(
                            f"Line {item.line_number}: corrected qty {old_qty} → {item.quantity} (from total/rate)"
                        )
                        corrected = True

                if not corrected:
                    checks.append(ValidationCheck(
                        name=f"line_{item.line_number}_qty_x_rate",
                        passed=False,
                        detail=f"Line {item.line_number}: {item.quantity} × {item.unit_price} = {expected:.2f} ≠ {item.line_total:.2f}",
                    ))
                else:
                    checks.append(ValidationCheck(
                        name=f"line_{item.line_number}_qty_x_rate",
                        passed=True,
                        detail=f"Line {item.line_number}: auto-corrected, now {item.quantity} × {item.unit_price} ≈ {item.line_total:.2f}",
                    ))

        # --- 2. Taxable amount validation ---
        if item.taxable_amount and item.tax_rate_percent and item.tax_rate_percent > 0:
            expected_tax = item.taxable_amount * item.tax_rate_percent / 100
            if item.tax_amount:
                if _approx_eq(expected_tax, item.tax_amount):
                    checks.append(ValidationCheck(
                        name=f"line_{item.line_number}_tax_calc",
                        passed=True,
                        detail=f"Line {item.line_number}: taxable {item.taxable_amount} × {item.tax_rate_percent}% = {expected_tax:.2f} ≈ tax {item.tax_amount:.2f}",
                    ))
                else:
                    checks.append(ValidationCheck(
                        name=f"line_{item.line_number}_tax_calc",
                        passed=False,
                        detail=f"Line {item.line_number}: taxable {item.taxable_amount} × {item.tax_rate_percent}% = {expected_tax:.2f} ≠ tax {item.tax_amount:.2f}",
                    ))

        # Fill in missing taxable_amount
        if item.taxable_amount is None and item.quantity > 0 and item.unit_price > 0:
            item.taxable_amount = round(item.quantity * item.unit_price, 4)

        # Fill in missing tax_rate from tax_amount and taxable_amount
        if (
            item.tax_rate_percent is None or item.tax_rate_percent == 0
        ) and item.tax_amount and item.tax_amount > 0 and item.taxable_amount and item.taxable_amount > 0:
            item.tax_rate_percent = round((item.tax_amount / item.taxable_amount) * 100, 2)
            corrections.append(
                f"Line {item.line_number}: calculated tax_rate = {item.tax_rate_percent}% from tax_amount/taxable_amount"
            )

        # Fill in missing tax_amount from tax_rate and taxable_amount
        if (
            item.tax_amount is None or item.tax_amount == 0
        ) and item.tax_rate_percent and item.tax_rate_percent > 0 and item.taxable_amount and item.taxable_amount > 0:
            item.tax_amount = round(item.taxable_amount * item.tax_rate_percent / 100, 4)
            corrections.append(
                f"Line {item.line_number}: calculated tax_amount = {item.tax_amount} from taxable × rate"
            )

    # --- 3. Subtotal validation: sum of line taxable_amounts ≈ subtotal ---
    if result.line_items:
        line_subtotal = sum(
            item.taxable_amount or item.line_total
            for item in result.line_items
        )
        if result.subtotal:
            if _approx_eq(line_subtotal, result.subtotal):
                checks.append(ValidationCheck(
                    name="subtotal_matches_lines",
                    passed=True,
                    detail=f"Sum of line items ({line_subtotal:.2f}) ≈ subtotal ({result.subtotal:.2f})",
                ))
            else:
                checks.append(ValidationCheck(
                    name="subtotal_matches_lines",
                    passed=False,
                    detail=f"Sum of line items ({line_subtotal:.2f}) ≠ subtotal ({result.subtotal:.2f})",
                ))
                # Trust line items over extracted subtotal if difference is small
                if abs(line_subtotal - result.subtotal) / max(line_subtotal, result.subtotal, 1) < 0.1:
                    result.subtotal = round(line_subtotal, 4)
                    corrections.append(f"Recalculated subtotal = {result.subtotal} from line items")
        else:
            result.subtotal = round(line_subtotal, 4)
            corrections.append(f"Calculated subtotal = {result.subtotal} from line items")

    # --- 4. Tax total validation ---
    if result.line_items:
        line_tax_total = sum(item.tax_amount or 0 for item in result.line_items)
        if line_tax_total > 0:
            if result.tax_total:
                if _approx_eq(line_tax_total, result.tax_total):
                    checks.append(ValidationCheck(
                        name="tax_total_matches_lines",
                        passed=True,
                        detail=f"Sum of line taxes ({line_tax_total:.2f}) ≈ tax total ({result.tax_total:.2f})",
                    ))
                else:
                    checks.append(ValidationCheck(
                        name="tax_total_matches_lines",
                        passed=False,
                        detail=f"Sum of line taxes ({line_tax_total:.2f}) ≠ tax total ({result.tax_total:.2f})",
                    ))
            else:
                result.tax_total = round(line_tax_total, 4)
                corrections.append(f"Calculated tax_total = {result.tax_total} from line items")

    # --- 5. Grand total validation: subtotal + tax ≈ total ---
    if result.subtotal and result.total:
        expected_total = result.subtotal + (result.tax_total or 0) - (result.discount or 0)
        if _approx_eq(expected_total, result.total):
            checks.append(ValidationCheck(
                name="grand_total_calc",
                passed=True,
                detail=f"subtotal ({result.subtotal:.2f}) + tax ({result.tax_total or 0:.2f}) - discount ({result.discount or 0:.2f}) = {expected_total:.2f} ≈ total ({result.total:.2f})",
            ))
        else:
            checks.append(ValidationCheck(
                name="grand_total_calc",
                passed=False,
                detail=f"subtotal ({result.subtotal:.2f}) + tax ({result.tax_total or 0:.2f}) - discount ({result.discount or 0:.2f}) = {expected_total:.2f} ≠ total ({result.total:.2f})",
            ))
            # If subtotal + tax is close to total, trust the calculation
            if result.tax_total is None and result.total > result.subtotal:
                result.tax_total = round(result.total - result.subtotal + (result.discount or 0), 4)
                corrections.append(f"Calculated tax_total = {result.tax_total} from total - subtotal")

    # --- 6. Balance due validation ---
    if result.total and result.amount_paid is not None:
        expected_balance = result.total - result.amount_paid
        if result.balance_due:
            if _approx_eq(expected_balance, result.balance_due):
                checks.append(ValidationCheck(
                    name="balance_due_calc",
                    passed=True,
                    detail=f"total ({result.total:.2f}) - paid ({result.amount_paid:.2f}) = {expected_balance:.2f} ≈ balance ({result.balance_due:.2f})",
                ))
            else:
                checks.append(ValidationCheck(
                    name="balance_due_calc",
                    passed=False,
                    detail=f"total ({result.total:.2f}) - paid ({result.amount_paid:.2f}) = {expected_balance:.2f} ≠ balance ({result.balance_due:.2f})",
                ))
        else:
            result.balance_due = round(expected_balance, 4)

    all_passed = all(c.passed for c in checks) if checks else True

    result.validation = ValidationResult(
        all_passed=all_passed,
        checks=checks,
        corrections_applied=corrections,
    )

    return result


def compute_confidence(result: OcrExtractionResult) -> OcrExtractionResult:
    """Compute confidence scores based on extraction quality."""
    conf = result.confidence

    # Invoice number confidence
    if result.invoice_number:
        conf.invoice_number = 90.0
    else:
        conf.invoice_number = 0.0

    # Date confidence
    date_score = 0.0
    if result.invoice_date:
        date_score += 50.0
    if result.due_date:
        date_score += 40.0
    conf.dates = min(date_score, 95.0)

    # Vendor confidence
    if result.vendor.name:
        vendor_score = 60.0
        if result.vendor.tax_id:
            vendor_score += 20.0
        if result.vendor.address:
            vendor_score += 10.0
        if result.vendor.email or result.vendor.phone:
            vendor_score += 10.0
        conf.vendor = min(vendor_score, 95.0)
    else:
        conf.vendor = 0.0

    # Line items confidence
    if result.line_items:
        item_scores: list[float] = []
        for item in result.line_items:
            score = 0.0
            if item.description:
                score += 30.0
            if item.quantity > 0:
                score += 20.0
            if item.unit_price > 0:
                score += 20.0
            if item.line_total > 0:
                score += 15.0
            # Bonus for math correctness
            if item.quantity > 0 and item.unit_price > 0 and item.line_total > 0:
                if _approx_eq(item.quantity * item.unit_price, item.line_total):
                    score += 15.0
            item_scores.append(min(score, 100.0))
        conf.line_items = sum(item_scores) / len(item_scores)
    else:
        conf.line_items = 0.0

    # Totals confidence
    totals_score = 0.0
    if result.total:
        totals_score += 40.0
    if result.subtotal:
        totals_score += 25.0
    if result.tax_total is not None:
        totals_score += 20.0
    if result.validation.all_passed:
        totals_score += 15.0
    conf.totals = min(totals_score, 100.0)

    # Overall confidence
    weights = {
        "invoice_number": 0.15,
        "dates": 0.10,
        "vendor": 0.15,
        "line_items": 0.35,
        "totals": 0.25,
    }
    conf.overall = (
        conf.invoice_number * weights["invoice_number"]
        + conf.dates * weights["dates"]
        + conf.vendor * weights["vendor"]
        + conf.line_items * weights["line_items"]
        + conf.totals * weights["totals"]
    )

    result.confidence = conf
    return result
