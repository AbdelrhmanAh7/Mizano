"""Intelligent document parser — zone detection and field extraction."""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Optional

from app.models.schemas import AddressInfo, OcrTextBlock, VendorInfo

logger = logging.getLogger(__name__)

# --- Zone Detection ---

HEADER_KEYWORDS = {
    "tax invoice",
    "invoice",
    "bill",
    "receipt",
    "credit note",
    "debit note",
    "purchase order",
    "quotation",
    "proforma",
    "statement",
}

TOTALS_KEYWORDS = {
    "subtotal",
    "sub-total",
    "sub total",
    "total",
    "grand total",
    "amount due",
    "balance due",
    "net amount",
    "tax total",
    "vat",
    "discount",
    "amount paid",
    "payment",
}

TABLE_HEADER_KEYWORDS = {
    "description",
    "item",
    "product",
    "service",
    "particular",
    "qty",
    "quantity",
    "rate",
    "price",
    "unit price",
    "amount",
    "total",
    "tax",
    "vat",
    "taxable",
}

BILL_TO_KEYWORDS = {"bill to", "billed to", "sold to", "customer", "client", "buyer"}
SHIP_TO_KEYWORDS = {"ship to", "shipped to", "deliver to", "delivery address"}


def detect_zones(
    blocks: list[OcrTextBlock], img_height: float
) -> dict[str, list[OcrTextBlock]]:
    """Split blocks into document zones based on Y-position and keywords."""
    if not blocks:
        return {"header": [], "addresses": [], "table": [], "totals": []}

    sorted_blocks = sorted(blocks, key=lambda b: b.y_center)

    header: list[OcrTextBlock] = []
    addresses: list[OcrTextBlock] = []
    table: list[OcrTextBlock] = []
    totals: list[OcrTextBlock] = []

    # Find table header start (first row containing table-like keywords)
    table_start_y = img_height * 0.9  # default to near-bottom if not found
    for block in sorted_blocks:
        text_lower = block.text.lower().strip()
        if any(kw in text_lower for kw in ("description", "item", "particular", "qty", "quantity")):
            table_start_y = block.y_min - 5
            break

    # Find totals start (first row with subtotal/total after table)
    totals_start_y = img_height * 0.95
    for block in reversed(sorted_blocks):
        text_lower = block.text.lower().strip()
        if any(kw in text_lower for kw in ("subtotal", "sub-total", "sub total", "total", "grand total")):
            totals_start_y = min(totals_start_y, block.y_min - 5)

    for block in sorted_blocks:
        y = block.y_center
        if y < table_start_y * 0.5:
            text_lower = block.text.lower()
            if any(kw in text_lower for kw in BILL_TO_KEYWORDS | SHIP_TO_KEYWORDS):
                addresses.append(block)
            else:
                header.append(block)
        elif y < table_start_y:
            addresses.append(block)
        elif y < totals_start_y:
            table.append(block)
        else:
            totals.append(block)

    return {
        "header": header,
        "addresses": addresses,
        "table": table,
        "totals": totals,
    }


# --- Field Extraction ---

# Number patterns that preserve all decimals
AMOUNT_RE = re.compile(r"(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)")
CURRENCY_RE = re.compile(
    r"(AED|USD|EUR|GBP|SAR|QAR|BHD|KWD|OMR|EGP|INR|PKR|PHP|MYR|SGD|HKD|JPY|CNY|CAD|AUD|NZD|CHF|SEK|NOK|DKK|TRY|ZAR|BRL|MXN|THB|IDR|VND|KRW|TWD)"
)
CURRENCY_SYMBOL_MAP = {
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
    "¥": "JPY",
    "₹": "INR",
    "د.إ": "AED",
    "ر.س": "SAR",
    "ر.ق": "QAR",
    "د.ب": "BHD",
    "د.ك": "KWD",
    "ر.ع": "OMR",
}

DATE_PATTERNS = [
    # DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    (re.compile(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b"), "dmy"),
    # YYYY-MM-DD (ISO)
    (re.compile(r"\b(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\b"), "ymd"),
    # DD Mon YYYY (e.g. 15 Jan 2026)
    (
        re.compile(
            r"\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b",
            re.IGNORECASE,
        ),
        "dMy",
    ),
    # Mon DD, YYYY (e.g. Jan 15, 2026)
    (
        re.compile(
            r"\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b",
            re.IGNORECASE,
        ),
        "Mdy",
    ),
    # DDMMYYYY (8 digits without separator)
    (re.compile(r"\b(\d{2})(\d{2})(\d{4})\b"), "dmy_nosep"),
]

MONTH_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

INVOICE_NUM_PATTERNS = [
    re.compile(
        r"(?:invoice|inv|bill|receipt|credit\s*note|tax\s*invoice)\s*(?:#|no\.?|number|num)?\s*[:\-]?\s*([A-Z0-9][\w\-/]{2,30})",
        re.IGNORECASE,
    ),
    re.compile(r"(?:#|No\.?|Number)\s*[:\-]?\s*([A-Z]{2,5}[\-/]?\d{3,10})", re.IGNORECASE),
    re.compile(r"\b(INV[\-/]?\d{3,10})\b", re.IGNORECASE),
    re.compile(r"\b(BILL[\-/]?\d{3,10})\b", re.IGNORECASE),
    re.compile(r"\b([A-Z]{2,4}[\-/]\d{4,10})\b"),
]


def parse_date(text: str) -> Optional[str]:
    """Try to extract and parse a date from text, return YYYY-MM-DD or None."""
    for pattern, fmt in DATE_PATTERNS:
        m = pattern.search(text)
        if not m:
            continue
        try:
            if fmt == "dmy":
                d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            elif fmt == "ymd":
                y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            elif fmt == "dMy":
                d = int(m.group(1))
                mo = MONTH_MAP.get(m.group(2).lower()[:3], 0)
                y = int(m.group(3))
            elif fmt == "Mdy":
                mo = MONTH_MAP.get(m.group(1).lower()[:3], 0)
                d = int(m.group(2))
                y = int(m.group(3))
            elif fmt == "dmy_nosep":
                d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            else:
                continue

            if mo == 0 or d < 1 or d > 31 or mo > 12 or y < 1900 or y > 2100:
                continue
            dt = datetime(y, mo, d)
            return dt.strftime("%Y-%m-%d")
        except (ValueError, OverflowError):
            continue
    return None


def extract_invoice_number(text: str) -> Optional[str]:
    """Extract invoice/bill number from text."""
    for pattern in INVOICE_NUM_PATTERNS:
        m = pattern.search(text)
        if m:
            num = m.group(1).strip()
            if len(num) >= 3:
                return num
    return None


def extract_currency(text: str) -> Optional[str]:
    """Extract currency code from text."""
    m = CURRENCY_RE.search(text)
    if m:
        return m.group(1)
    for symbol, code in CURRENCY_SYMBOL_MAP.items():
        if symbol in text:
            return code
    return None


def extract_amount(text: str) -> Optional[float]:
    """Extract a monetary amount from text, preserving decimals."""
    m = AMOUNT_RE.search(text)
    if m:
        val_str = m.group(1).replace(",", "")
        try:
            return float(val_str)
        except ValueError:
            pass
    return None


def extract_labeled_amount(text: str, label_pattern: str) -> Optional[float]:
    """Extract amount following a label like 'Total: 135.45'."""
    pattern = re.compile(
        label_pattern + r"\s*[:\-]?\s*[\$€£¥₹]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)",
        re.IGNORECASE,
    )
    m = pattern.search(text)
    if m:
        val_str = m.group(1).replace(",", "")
        try:
            return float(val_str)
        except ValueError:
            pass
    return None


def extract_dates_from_blocks(
    blocks: list[OcrTextBlock],
) -> tuple[Optional[str], Optional[str]]:
    """Extract invoice date and due date from OCR blocks."""
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    all_dates: list[str] = []

    for block in blocks:
        text = block.text
        text_lower = text.lower()

        # Labeled date extraction (highest priority)
        if any(kw in text_lower for kw in ("invoice date", "bill date", "date of invoice", "issue date", "invoice dt")):
            d = parse_date(text)
            if d:
                invoice_date = d
                continue

        if any(kw in text_lower for kw in ("due date", "payment due", "due by", "pay by", "due dt")):
            d = parse_date(text)
            if d:
                due_date = d
                continue

        if "date" in text_lower:
            d = parse_date(text)
            if d:
                if not invoice_date:
                    invoice_date = d
                elif not due_date:
                    due_date = d
                continue

        d = parse_date(text)
        if d:
            all_dates.append(d)

    if not invoice_date and all_dates:
        invoice_date = min(all_dates)
    if not due_date and len(all_dates) >= 2:
        due_date = max(all_dates)

    return invoice_date, due_date


def extract_vendor_info(blocks: list[OcrTextBlock]) -> VendorInfo:
    """Extract vendor information from header blocks."""
    vendor = VendorInfo()
    if not blocks:
        return vendor

    texts = [b.text.strip() for b in blocks if len(b.text.strip()) > 2]

    # First non-keyword text is likely the company name
    skip_words = {
        "tax invoice", "invoice", "bill", "receipt", "date", "number",
        "no.", "page", "total", "subtotal", "vat", "trn", "po box",
    }

    for text in texts:
        text_lower = text.lower().strip()
        if any(kw in text_lower for kw in skip_words):
            continue
        if re.match(r"^\d+$", text):
            continue
        # Company name heuristics: contains uppercase letters, not pure number
        if len(text) >= 3 and not text.isdigit():
            vendor.name = text
            break

    # TRN / Tax ID
    for text in texts:
        trn_match = re.search(
            r"(?:TRN|VAT|GST|Tax\s*ID|Tax\s*Reg)\s*[:\-#]?\s*(\d[\d\-\s]{5,20})",
            text,
            re.IGNORECASE,
        )
        if trn_match:
            vendor.tax_id = trn_match.group(1).strip()
            break

    # Phone
    for text in texts:
        phone_match = re.search(r"(?:Tel|Phone|Ph|Mobile|Mob)\s*[:\-]?\s*([\+\d\s\-()]{7,20})", text, re.IGNORECASE)
        if phone_match:
            vendor.phone = phone_match.group(1).strip()
            break

    # Email
    for text in texts:
        email_match = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
        if email_match:
            vendor.email = email_match.group(0)
            break

    # Address — look for lines with numbers, road, street, etc.
    addr_parts = []
    for text in texts:
        if text == vendor.name:
            continue
        text_lower = text.lower()
        if any(
            kw in text_lower
            for kw in ("street", "road", "ave", "blvd", "floor", "building", "bldg", "po box", "p.o.", "suite", "ste")
        ):
            addr_parts.append(text)
        elif re.search(r"\b\d{3,}", text) and len(text) > 5:
            addr_parts.append(text)

    if addr_parts:
        vendor.address = ", ".join(addr_parts[:3])

    return vendor


def extract_address_info(blocks: list[OcrTextBlock], keywords: set[str]) -> AddressInfo:
    """Extract bill-to or ship-to address from blocks."""
    info = AddressInfo()
    if not blocks:
        return info

    # Find the block that contains the keyword
    start_idx = -1
    for i, block in enumerate(blocks):
        text_lower = block.text.lower()
        if any(kw in text_lower for kw in keywords):
            start_idx = i
            break

    if start_idx < 0:
        return info

    # Lines after the keyword are the address
    following = blocks[start_idx + 1 : start_idx + 5]
    if following:
        info.name = following[0].text.strip()
        if len(following) > 1:
            info.address = ", ".join(b.text.strip() for b in following[1:])

    return info


def extract_totals_from_blocks(
    blocks: list[OcrTextBlock],
) -> dict[str, Optional[float]]:
    """Extract subtotal, tax, total, discount, amount_paid, balance_due from totals zone."""
    result: dict[str, Optional[float]] = {
        "subtotal": None,
        "tax_total": None,
        "total": None,
        "discount": None,
        "amount_paid": None,
        "balance_due": None,
    }

    full_text = "\n".join(b.text for b in blocks)

    # Pair each block with its amount (look for amounts on the same line or next block)
    for i, block in enumerate(blocks):
        text_lower = block.text.lower().strip()

        # Try to extract amount from current block
        amount = extract_amount(block.text)

        # If no amount in this block, check next block on same Y line
        if amount is None and i + 1 < len(blocks):
            next_block = blocks[i + 1]
            if abs(next_block.y_center - block.y_center) < 15:
                amount = extract_amount(next_block.text)

        if amount is None:
            continue

        if any(kw in text_lower for kw in ("grand total", "total amount", "net payable", "amount due", "invoice total")):
            result["total"] = amount
        elif any(kw in text_lower for kw in ("subtotal", "sub-total", "sub total", "taxable amount", "net amount")):
            result["subtotal"] = amount
        elif any(kw in text_lower for kw in ("vat", "tax", "gst", "sales tax", "service tax")):
            if result["tax_total"] is None:
                result["tax_total"] = amount
        elif "discount" in text_lower:
            result["discount"] = amount
        elif any(kw in text_lower for kw in ("amount paid", "paid", "payment received")):
            result["amount_paid"] = amount
        elif any(kw in text_lower for kw in ("balance due", "balance", "remaining")):
            result["balance_due"] = amount
        elif "total" in text_lower and result["total"] is None:
            result["total"] = amount

    # Fallback: try labeled extraction on full text
    if result["subtotal"] is None:
        result["subtotal"] = extract_labeled_amount(full_text, r"(?:sub\s*total|subtotal)")
    if result["tax_total"] is None:
        result["tax_total"] = extract_labeled_amount(full_text, r"(?:vat|tax|gst)")
    if result["total"] is None:
        result["total"] = extract_labeled_amount(full_text, r"(?:grand\s*total|total\s*amount|total)")
    if result["discount"] is None:
        result["discount"] = extract_labeled_amount(full_text, r"discount")

    return result


def extract_document_type(text: str) -> str:
    """Classify document type from text content."""
    text_lower = text.lower()
    if any(kw in text_lower for kw in ("credit note", "credit memo")):
        return "CREDIT_NOTE"
    if any(kw in text_lower for kw in ("debit note", "debit memo")):
        return "DEBIT_NOTE"
    if any(kw in text_lower for kw in ("purchase order", "po number")):
        return "PURCHASE_ORDER"
    if any(kw in text_lower for kw in ("receipt", "payment receipt")):
        return "RECEIPT"
    if any(kw in text_lower for kw in ("tax invoice", "invoice")):
        return "BILL"
    if "bill" in text_lower:
        return "BILL"
    return "BILL"
