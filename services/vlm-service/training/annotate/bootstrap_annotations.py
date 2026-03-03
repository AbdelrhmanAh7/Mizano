"""Convert ground-truth.ts → annotations/ground_truth.json.

Parses the TypeScript ground truth file and maps fields to the VLM output
schema used for training.

Usage:
    python -m training.annotate.bootstrap_annotations
"""

import json
import re
import sys
from pathlib import Path

from training.annotate.annotation_schema import (
    AnnotationAccountingEntry,
    AnnotationConfidence,
    AnnotationDataset,
    AnnotationEntry,
    AnnotationGroundTruth,
    AnnotationLineItem,
)
from training.config import ANNOTATIONS_DIR, ANNOTATIONS_JSON, GROUND_TRUTH_TS, TEST_DATA_DIR


# Files in test-data/ that are NOT in ground-truth.ts
MISSING_FILES = {
    "INV-1254.pdf",
    "(15-11-25)Warehouse Rent-#25994.pdf",
    "(15-12-25)Warehouse Cabin-#2462.pdf",
    "WhatsApp Image 2026-02-16 at 23.42.28.jpeg",
}

# Files where the ground-truth filename differs from the test-data filename
FILENAME_MAP: dict[str, str] = {
    "PHOTO-2026-02-16-23-42-59.jpg": "WhatsApp Image 2026-02-16 at 23.42.59.jpeg",
}


def _parse_ground_truth_ts(ts_path: Path) -> list[dict]:
    """Extract GroundTruthEntry objects from the TypeScript source."""
    content = ts_path.read_text(encoding="utf-8")

    # Extract the array body between the opening [ and closing ];
    array_match = re.search(
        r"export\s+const\s+GROUND_TRUTH\s*:\s*GroundTruthEntry\[\]\s*=\s*\[(.*)\];",
        content,
        re.DOTALL,
    )
    if not array_match:
        raise ValueError("Could not find GROUND_TRUTH array in TypeScript file")

    array_body = array_match.group(1)

    # Extract individual object blocks { ... }
    entries: list[dict] = []
    brace_depth = 0
    current_block = ""
    in_block = False

    for char in array_body:
        if char == "{":
            brace_depth += 1
            in_block = True
        if in_block:
            current_block += char
        if char == "}":
            brace_depth -= 1
            if brace_depth == 0 and in_block:
                entry = _parse_ts_object(current_block)
                if entry:
                    entries.append(entry)
                current_block = ""
                in_block = False

    return entries


def _parse_ts_object(block: str) -> dict | None:
    """Parse a single TypeScript object literal into a dict."""
    # Clean up TypeScript-specific syntax for JSON parsing
    cleaned = block.strip()

    # Remove comments (// ...)
    cleaned = re.sub(r"//[^\n]*", "", cleaned)

    # Replace single-quoted strings with double-quoted
    # Handle escaped apostrophes in strings like "Chef's"
    cleaned = re.sub(r"(?<!\\)'((?:[^'\\]|\\.)*)'", r'"\1"', cleaned)

    # Add quotes around unquoted keys
    cleaned = re.sub(r"(\{|,)\s*(\w+)\s*:", r'\1 "\2":', cleaned)

    # Remove trailing commas before } or ]
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)

    # Handle null values
    cleaned = cleaned.replace("null", "null")

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Fallback: regex extraction for key fields
        return _regex_extract(block)


def _regex_extract(block: str) -> dict | None:
    """Fallback field extraction using regex."""

    def _extract_str(key: str) -> str | None:
        m = re.search(rf"{key}\s*:\s*['\"](.+?)['\"]", block)
        return m.group(1) if m else None

    def _extract_str_or_null(key: str) -> str | None:
        m = re.search(rf"{key}\s*:\s*null", block)
        if m:
            return None
        return _extract_str(key)

    def _extract_num(key: str) -> float | None:
        m = re.search(rf"{key}\s*:\s*null", block)
        if m:
            return None
        m = re.search(rf"{key}\s*:\s*([\d.]+)", block)
        return float(m.group(1)) if m else None

    file_val = _extract_str("file")
    if not file_val:
        return None

    # Extract lineItems array
    line_items: list[dict] = []
    items_match = re.search(r"lineItems\s*:\s*\[(.*?)\]", block, re.DOTALL)
    if items_match:
        items_body = items_match.group(1).strip()
        if items_body:
            # Extract individual item objects
            item_blocks = re.findall(r"\{(.*?)\}", items_body, re.DOTALL)
            for item_block in item_blocks:
                item: dict = {}
                desc_m = re.search(r"description\s*:\s*['\"](.+?)['\"]", item_block)
                if desc_m:
                    item["description"] = desc_m.group(1)
                qty_m = re.search(r"quantity\s*:\s*([\d.]+)", item_block)
                if qty_m:
                    item["quantity"] = float(qty_m.group(1))
                up_m = re.search(r"unitPrice\s*:\s*([\d.]+)", item_block)
                if up_m:
                    item["unitPrice"] = float(up_m.group(1))
                tot_m = re.search(r"total\s*:\s*([\d.]+)", item_block)
                if tot_m:
                    item["total"] = float(tot_m.group(1))
                if item:
                    line_items.append(item)

    return {
        "file": file_val,
        "description": _extract_str_or_null("description") or "",
        "vendorName": _extract_str_or_null("vendorName"),
        "invoiceNumber": _extract_str_or_null("invoiceNumber"),
        "date": _extract_str_or_null("date"),
        "dueDate": _extract_str_or_null("dueDate"),
        "total": _extract_num("total"),
        "subtotal": _extract_num("subtotal"),
        "tax": _extract_num("tax"),
        "currency": _extract_str_or_null("currency"),
        "paymentTerms": _extract_str_or_null("paymentTerms"),
        "lineItems": line_items,
    }


def _detect_language(entry: dict) -> str:
    """Detect primary language from vendor name and description."""
    vendor = entry.get("vendorName") or ""
    desc = entry.get("description") or ""
    text = vendor + " " + desc

    arabic_chars = len(re.findall(r"[\u0600-\u06FF]", text))
    latin_chars = len(re.findall(r"[a-zA-Z]", text))

    if arabic_chars > 0 and latin_chars > 0:
        return "mixed" if arabic_chars > 3 and latin_chars > 3 else ("ar" if arabic_chars > latin_chars else "en")
    if arabic_chars > 0:
        return "ar"
    return "en"


def _detect_quality(entry: dict) -> str:
    """Heuristic quality classification from description."""
    desc = (entry.get("description") or "").lower()
    if "faded" in desc or "low" in desc:
        return "faded"
    if "scanned" in desc:
        return "scanned"
    return "good"


def _suggest_accounting_entry(entry: dict) -> AnnotationAccountingEntry:
    """Suggest accounting entry based on description keywords."""
    desc = (entry.get("description") or "").lower()
    vendor = (entry.get("vendorName") or "").lower()

    debit = "Operating Expenses"
    if any(kw in desc for kw in ["gas", "fuel", "petrol", "station"]):
        debit = "Vehicle Expenses"
    elif any(kw in desc for kw in ["restaurant", "food", "coffee", "bakery", "burger", "catering"]):
        debit = "Meals & Entertainment"
    elif any(kw in desc for kw in ["grocery", "supermarket", "market"]):
        debit = "Supplies"
    elif any(kw in desc for kw in ["hotel", "apartment", "rent", "cabin"]):
        debit = "Rent Expense"
    elif any(kw in desc for kw in ["shipping", "delivery", "storage"]):
        debit = "Shipping & Logistics"
    elif any(kw in desc for kw in ["bank"]):
        debit = "Bank Charges"

    tax = entry.get("tax")
    return AnnotationAccountingEntry(
        debit_account=debit,
        credit_account="Accounts Payable",
        tax_account="Input VAT" if tax else None,
    )


def _convert_entry(ts_entry: dict) -> AnnotationEntry:
    """Convert a TypeScript ground truth entry to our annotation schema."""
    file_name = ts_entry["file"]

    # Map filename if it differs between ground-truth.ts and test-data/
    actual_file = FILENAME_MAP.get(file_name, file_name)

    # Convert lineItems: camelCase → snake_case
    items = []
    for li in ts_entry.get("lineItems", []):
        items.append(
            AnnotationLineItem(
                description=li.get("description", ""),
                quantity=li.get("quantity", 1.0),
                unit_price=li.get("unitPrice", 0.0),
                total=li.get("total", 0.0),
            )
        )

    # Build confidence — ground truth is always 1.0 for fields we have
    confidence = AnnotationConfidence(
        overall=1.0 if ts_entry.get("total") is not None else 0.0,
        vendor_name=1.0 if ts_entry.get("vendorName") else 0.0,
        invoice_date=1.0 if ts_entry.get("date") else 0.0,
        total_amount=1.0 if ts_entry.get("total") is not None else 0.0,
        line_items=1.0 if items else 0.0,
    )

    ground_truth = AnnotationGroundTruth(
        vendor_name=ts_entry.get("vendorName"),
        invoice_number=ts_entry.get("invoiceNumber"),
        invoice_date=ts_entry.get("date"),
        due_date=ts_entry.get("dueDate"),
        currency=ts_entry.get("currency"),
        subtotal=ts_entry.get("subtotal"),
        tax_amount=ts_entry.get("tax"),
        total_amount=ts_entry.get("total"),
        payment_terms=ts_entry.get("paymentTerms"),
        items=items,
        accounting_entry=_suggest_accounting_entry(ts_entry),
        confidence=confidence,
    )

    return AnnotationEntry(
        file=actual_file,
        description=ts_entry.get("description", ""),
        language=_detect_language(ts_entry),
        quality=_detect_quality(ts_entry),
        ground_truth=ground_truth,
    )


def bootstrap() -> AnnotationDataset:
    """Parse ground-truth.ts and produce the annotation dataset."""
    if not GROUND_TRUTH_TS.exists():
        print(f"ERROR: Ground truth file not found: {GROUND_TRUTH_TS}", file=sys.stderr)
        sys.exit(1)

    ts_entries = _parse_ground_truth_ts(GROUND_TRUTH_TS)
    print(f"Parsed {len(ts_entries)} entries from ground-truth.ts")

    entries: list[AnnotationEntry] = []
    for ts_entry in ts_entries:
        entry = _convert_entry(ts_entry)
        entries.append(entry)

    # Add placeholder entries for files missing annotations
    test_data_files = {f.name for f in TEST_DATA_DIR.iterdir() if f.is_file()} if TEST_DATA_DIR.exists() else set()
    annotated_files = {e.file for e in entries}

    for missing_file in sorted(test_data_files - annotated_files):
        entries.append(
            AnnotationEntry(
                file=missing_file,
                description=f"NEEDS MANUAL ANNOTATION — no ground truth available",
                needs_manual_review=True,
                ground_truth=AnnotationGroundTruth(),
            )
        )

    dataset = AnnotationDataset(
        total_files=len(test_data_files),
        annotated_files=len([e for e in entries if not e.needs_manual_review]),
        entries=entries,
    )

    return dataset


def main() -> None:
    dataset = bootstrap()

    ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)
    ANNOTATIONS_JSON.write_text(
        dataset.model_dump_json(indent=2),
        encoding="utf-8",
    )

    print(f"Written {ANNOTATIONS_JSON}")
    print(f"  Total files in test-data/: {dataset.total_files}")
    print(f"  Annotated: {dataset.annotated_files}")
    print(f"  Needs manual review: {dataset.total_files - dataset.annotated_files}")

    for entry in dataset.entries:
        if entry.needs_manual_review:
            print(f"  [MISSING] {entry.file}")


if __name__ == "__main__":
    main()
