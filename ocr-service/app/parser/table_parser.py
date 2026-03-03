"""Table/line-items parser — extracts structured rows from OCR text blocks."""

from __future__ import annotations

import logging
import re
from typing import Optional

from app.models.schemas import LineItem, OcrTextBlock

logger = logging.getLogger(__name__)

# Column header synonyms for matching
COLUMN_SYNONYMS: dict[str, list[str]] = {
    "description": ["description", "item", "product", "service", "particular", "details", "name"],
    "quantity": ["qty", "quantity", "qnty", "units", "hrs", "hours"],
    "unit_price": ["rate", "price", "unit price", "unit cost", "unit rate", "unit amt"],
    "tax_rate": ["tax %", "tax rate", "vat %", "vat rate", "tax", "vat"],
    "taxable_amount": ["taxable", "taxable amount", "taxable amt", "net", "net amount"],
    "tax_amount": ["tax amt", "tax amount", "vat amt", "vat amount"],
    "line_total": ["amount", "total", "line total", "line amt", "net amt"],
}


def _find_column_headers(
    blocks: list[OcrTextBlock],
) -> tuple[Optional[float], dict[str, float]]:
    """Identify table header row and map column names to X positions.

    Returns (header_y, {column_name: x_center}).
    """
    # Scan blocks sorted by Y for a row that has multiple table-like keywords
    y_groups: dict[int, list[OcrTextBlock]] = {}
    for block in blocks:
        y_key = int(block.y_center / 12)  # group by ~12px bands
        y_groups.setdefault(y_key, []).append(block)

    best_row_y: Optional[float] = None
    best_columns: dict[str, float] = {}
    best_score = 0

    for y_key in sorted(y_groups):
        row_blocks = sorted(y_groups[y_key], key=lambda b: b.x_center)
        row_text_lower = " ".join(b.text.lower() for b in row_blocks)

        score = 0
        columns: dict[str, float] = {}

        for col_name, synonyms in COLUMN_SYNONYMS.items():
            for syn in synonyms:
                for block in row_blocks:
                    if syn in block.text.lower():
                        columns[col_name] = block.x_center
                        score += 1
                        break
                if col_name in columns:
                    break

        # Need at least 2 column matches including description or amount
        if score >= 2 and ("description" in columns or "line_total" in columns):
            if score > best_score:
                best_score = score
                best_columns = columns
                best_row_y = min(b.y_min for b in row_blocks)

    if best_row_y is not None:
        logger.info(
            "Found table headers at y=%.0f with columns: %s",
            best_row_y,
            list(best_columns.keys()),
        )

    return best_row_y, best_columns


def _group_blocks_into_rows(
    blocks: list[OcrTextBlock], y_threshold: float = 15.0
) -> list[list[OcrTextBlock]]:
    """Group text blocks into rows by Y-coordinate proximity."""
    if not blocks:
        return []

    sorted_blocks = sorted(blocks, key=lambda b: b.y_center)
    rows: list[list[OcrTextBlock]] = []
    current_row: list[OcrTextBlock] = [sorted_blocks[0]]

    for block in sorted_blocks[1:]:
        if abs(block.y_center - current_row[-1].y_center) <= y_threshold:
            current_row.append(block)
        else:
            rows.append(sorted(current_row, key=lambda b: b.x_center))
            current_row = [block]
    if current_row:
        rows.append(sorted(current_row, key=lambda b: b.x_center))

    return rows


def _map_block_to_column(
    block: OcrTextBlock, column_positions: dict[str, float], tolerance: float = 80.0
) -> Optional[str]:
    """Map a block to the closest column based on X position."""
    best_col = None
    best_dist = tolerance

    for col_name, col_x in column_positions.items():
        dist = abs(block.x_center - col_x)
        if dist < best_dist:
            best_dist = dist
            best_col = col_name

    return best_col


def _parse_number(text: str) -> Optional[float]:
    """Parse a number from text, preserving decimals."""
    # Remove currency symbols and whitespace
    cleaned = re.sub(r"[^\d.,\-]", "", text.strip())
    if not cleaned:
        return None

    # Handle comma as thousands separator
    if "," in cleaned and "." in cleaned:
        # 1,234.56 format
        cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        parts = cleaned.split(",")
        if len(parts) == 2 and len(parts[1]) <= 2:
            # Possible decimal comma: 124,29
            cleaned = cleaned.replace(",", ".")
        else:
            # Thousands separator: 1,234
            cleaned = cleaned.replace(",", "")

    try:
        return float(cleaned)
    except ValueError:
        return None


def _is_total_row(text: str) -> bool:
    """Check if row text looks like a total/subtotal row (not a line item)."""
    text_lower = text.lower().strip()
    return any(
        kw in text_lower
        for kw in (
            "subtotal", "sub-total", "sub total", "total", "grand total",
            "vat", "tax", "discount", "amount due", "balance",
            "amount paid", "net payable",
        )
    )


def _is_pure_number_row(row_text: str) -> bool:
    """Check if row is just numbers (e.g., a page number or serial)."""
    cleaned = re.sub(r"[\s,.\-]", "", row_text)
    return cleaned.isdigit() and len(cleaned) <= 4


def extract_line_items(
    table_blocks: list[OcrTextBlock], all_blocks: Optional[list[OcrTextBlock]] = None
) -> list[LineItem]:
    """Extract structured line items from table zone blocks."""
    if not table_blocks:
        return []

    header_y, column_positions = _find_column_headers(table_blocks)

    # If no headers found, try with all blocks
    if header_y is None and all_blocks:
        header_y, column_positions = _find_column_headers(all_blocks)

    # Filter blocks below the header
    data_blocks = table_blocks
    if header_y is not None:
        data_blocks = [b for b in table_blocks if b.y_min > header_y + 5]

    if not data_blocks:
        return _fallback_line_items(table_blocks)

    rows = _group_blocks_into_rows(data_blocks)
    items: list[LineItem] = []

    for row_idx, row in enumerate(rows):
        row_text = " ".join(b.text for b in row)

        # Skip total/subtotal rows and pure-number rows
        if _is_total_row(row_text):
            continue
        if _is_pure_number_row(row_text):
            continue

        if column_positions:
            item = _parse_row_with_columns(row, column_positions, row_idx + 1)
        else:
            item = _parse_row_heuristic(row, row_idx + 1)

        if item and (item.description or item.line_total > 0):
            items.append(item)

    if not items:
        return _fallback_line_items(table_blocks)

    return items


def _parse_row_with_columns(
    row: list[OcrTextBlock], columns: dict[str, float], line_num: int
) -> Optional[LineItem]:
    """Parse a row using detected column positions."""
    mapped: dict[str, str] = {}

    for block in row:
        col = _map_block_to_column(block, columns)
        if col:
            if col in mapped:
                mapped[col] += " " + block.text
            else:
                mapped[col] = block.text

    desc = mapped.get("description", "").strip()
    qty = _parse_number(mapped.get("quantity", "")) or 0.0
    unit_price = _parse_number(mapped.get("unit_price", "")) or 0.0
    tax_rate = _parse_number(mapped.get("tax_rate", ""))
    taxable_amount = _parse_number(mapped.get("taxable_amount", ""))
    tax_amount = _parse_number(mapped.get("tax_amount", ""))
    line_total = _parse_number(mapped.get("line_total", "")) or 0.0

    # If qty is 0, default to 1
    if qty == 0 and (unit_price > 0 or line_total > 0):
        qty = 1.0

    return LineItem(
        line_number=line_num,
        description=desc,
        quantity=qty,
        unit_price=unit_price,
        taxable_amount=taxable_amount,
        tax_rate_percent=tax_rate,
        tax_amount=tax_amount,
        line_total=line_total,
    )


def _parse_row_heuristic(row: list[OcrTextBlock], line_num: int) -> Optional[LineItem]:
    """Parse a row using heuristic (no column headers detected).

    Assumes: description is the leftmost non-numeric text,
    numbers appear right-to-left as: total, rate, quantity.
    """
    texts = [(b.text.strip(), b.x_center) for b in row]

    desc_parts: list[str] = []
    numbers: list[tuple[float, float]] = []  # (value, x_position)

    for text, x_pos in texts:
        num = _parse_number(text)
        if num is not None and re.match(r"^[\d,.\-\s]+$", text.strip()):
            numbers.append((num, x_pos))
        else:
            desc_parts.append(text)

    description = " ".join(desc_parts).strip()
    numbers.sort(key=lambda n: n[1])  # sort by X position

    qty = 0.0
    unit_price = 0.0
    line_total = 0.0

    if len(numbers) >= 3:
        qty = numbers[0][0]
        unit_price = numbers[1][0]
        line_total = numbers[-1][0]
    elif len(numbers) == 2:
        # Could be (qty, total) or (rate, total)
        if numbers[0][0] < 20:  # likely quantity
            qty = numbers[0][0]
            line_total = numbers[1][0]
            if qty > 0:
                unit_price = line_total / qty
        else:
            unit_price = numbers[0][0]
            line_total = numbers[1][0]
            qty = 1.0
    elif len(numbers) == 1:
        line_total = numbers[0][0]
        qty = 1.0
        unit_price = line_total

    if not description and line_total == 0:
        return None

    if qty == 0:
        qty = 1.0

    return LineItem(
        line_number=line_num,
        description=description,
        quantity=qty,
        unit_price=unit_price,
        line_total=line_total,
    )


def _fallback_line_items(blocks: list[OcrTextBlock]) -> list[LineItem]:
    """Last-resort extraction: find any row with description + numbers."""
    rows = _group_blocks_into_rows(blocks)
    items: list[LineItem] = []

    for row_idx, row in enumerate(rows):
        row_text = " ".join(b.text for b in row)
        if _is_total_row(row_text):
            continue

        # Find numbers in the row
        numbers = re.findall(r"\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?", row_text)
        float_nums = []
        for n in numbers:
            try:
                float_nums.append(float(n.replace(",", "")))
            except ValueError:
                pass

        if not float_nums:
            continue

        # Remove numbers from text to get description
        desc = re.sub(r"\d{1,3}(?:,\d{3})*(?:\.\d+)?", "", row_text).strip()
        desc = re.sub(r"\s+", " ", desc).strip(" |-")

        if len(desc) < 2:
            continue

        line_total = max(float_nums)
        qty = 1.0
        unit_price = line_total

        if len(float_nums) >= 3:
            qty = float_nums[0]
            unit_price = float_nums[1]
            line_total = float_nums[-1]
        elif len(float_nums) == 2:
            if float_nums[0] < 20:
                qty = float_nums[0]
                line_total = float_nums[1]
                unit_price = line_total / qty if qty else line_total
            else:
                unit_price = float_nums[0]
                line_total = float_nums[1]

        items.append(
            LineItem(
                line_number=row_idx + 1,
                description=desc,
                quantity=qty if qty > 0 else 1.0,
                unit_price=unit_price,
                line_total=line_total,
            )
        )

    return items
