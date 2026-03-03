"""FastAPI OCR microservice — PaddleOCR + Tesseract dual-engine extraction."""

from __future__ import annotations

import base64
import logging
import time
from io import BytesIO
from typing import Optional

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.engines import paddle_engine, tesseract_engine
from app.models.schemas import (
    AddressInfo,
    Base64Request,
    ConfidenceScores,
    HealthResponse,
    LineItem,
    OcrExtractionResult,
    OcrTextBlock,
    VendorInfo,
)
from app.parser import document_parser, table_parser, validator
from app.preprocessing import preprocess_for_paddle, preprocess_for_tesseract, preprocess_full

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Mizano OCR Service",
    description="Dual-engine OCR extraction with PaddleOCR + Tesseract",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/tiff",
    "image/webp",
    "image/bmp",
    "image/gif",
}
ALLOWED_PDF_TYPES = {"application/pdf"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


def _pdf_to_image(pdf_bytes: bytes) -> bytes:
    """Convert first page of PDF to PNG image bytes."""
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page = doc.load_page(0)
        # Render at 300 DPI
        mat = fitz.Matrix(300 / 72, 300 / 72)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")
        doc.close()
        return img_bytes
    except Exception:
        logger.exception("PDF to image conversion failed")
        raise HTTPException(status_code=400, detail="Failed to convert PDF to image")


def _merge_ocr_blocks(
    paddle_blocks: list[OcrTextBlock],
    tess_blocks: list[OcrTextBlock],
) -> list[OcrTextBlock]:
    """Merge results from both engines, preferring higher-confidence detections.

    Strategy: Use PaddleOCR as primary (better at detecting text regions),
    then fill in gaps with Tesseract results for regions PaddleOCR missed.
    Cross-validate overlapping detections.
    """
    if not paddle_blocks:
        return tess_blocks
    if not tess_blocks:
        return paddle_blocks

    merged: list[OcrTextBlock] = []

    # Use PaddleOCR blocks as primary
    for pb in paddle_blocks:
        # Find overlapping Tesseract block
        best_tess: Optional[OcrTextBlock] = None
        best_overlap = 0.0

        for tb in tess_blocks:
            # Check Y overlap
            y_overlap = max(
                0, min(pb.y_max, tb.y_max) - max(pb.y_min, tb.y_min)
            )
            x_overlap = max(
                0, min(pb.x_max, tb.x_max) - max(pb.x_min, tb.x_min)
            )
            overlap = y_overlap * x_overlap
            if overlap > best_overlap:
                best_overlap = overlap
                best_tess = tb

        if best_tess and best_overlap > 0:
            # Cross-validate: use higher confidence
            if best_tess.confidence > pb.confidence + 0.1:
                # Tesseract is significantly more confident — use its text
                merged.append(OcrTextBlock(
                    text=best_tess.text,
                    bbox=pb.bbox,  # Keep PaddleOCR bounding box (more accurate)
                    confidence=max(pb.confidence, best_tess.confidence),
                ))
            else:
                merged.append(pb)
        else:
            merged.append(pb)

    # Add Tesseract blocks that don't overlap with any PaddleOCR block
    for tb in tess_blocks:
        has_overlap = False
        for pb in paddle_blocks:
            y_overlap = max(0, min(pb.y_max, tb.y_max) - max(pb.y_min, tb.y_min))
            x_overlap = max(0, min(pb.x_max, tb.x_max) - max(pb.x_min, tb.x_min))
            if y_overlap * x_overlap > 0:
                has_overlap = True
                break
        if not has_overlap and tb.confidence > 0.5:
            merged.append(tb)

    return sorted(merged, key=lambda b: (b.y_center, b.x_center))


def _extract_from_bytes(file_bytes: bytes) -> OcrExtractionResult:
    """Core extraction pipeline."""
    start_time = time.time()

    # Preprocess for both engines
    paddle_img, tess_img = preprocess_full(file_bytes)

    # Run both engines
    paddle_blocks = paddle_engine.extract(paddle_img)
    tess_blocks = tesseract_engine.extract(tess_img)

    # Merge results
    merged_blocks = _merge_ocr_blocks(paddle_blocks, tess_blocks)

    if not merged_blocks:
        logger.warning("No text blocks extracted from either engine")
        return OcrExtractionResult(
            raw_ocr_text="",
            confidence=ConfidenceScores(overall=0),
        )

    # Build raw text
    raw_text = "\n".join(b.text for b in sorted(merged_blocks, key=lambda b: (b.y_center, b.x_center)))

    # Detect document zones
    img_height = float(max(b.y_max for b in merged_blocks))
    zones = document_parser.detect_zones(merged_blocks, img_height)

    # Extract fields from zones
    doc_type = document_parser.extract_document_type(raw_text)
    invoice_number = document_parser.extract_invoice_number(raw_text)
    currency = document_parser.extract_currency(raw_text)
    invoice_date, due_date = document_parser.extract_dates_from_blocks(
        zones["header"] + zones["addresses"]
    )

    # Vendor info from header
    vendor = document_parser.extract_vendor_info(zones["header"])

    # Bill-to and Ship-to from addresses zone
    bill_to = document_parser.extract_address_info(
        zones["addresses"], document_parser.BILL_TO_KEYWORDS
    )
    ship_to = document_parser.extract_address_info(
        zones["addresses"], document_parser.SHIP_TO_KEYWORDS
    )

    # Line items from table zone
    line_items = table_parser.extract_line_items(zones["table"], merged_blocks)

    # Totals from totals zone
    totals = document_parser.extract_totals_from_blocks(zones["totals"])

    # If totals zone was empty, try extracting from all blocks below table
    if not totals.get("total"):
        totals = document_parser.extract_totals_from_blocks(
            zones["totals"] + [b for b in merged_blocks if b.y_center > img_height * 0.7]
        )

    result = OcrExtractionResult(
        document_type=doc_type,
        invoice_number=invoice_number,
        invoice_date=invoice_date,
        due_date=due_date,
        currency=currency,
        vendor=vendor,
        bill_to=bill_to,
        ship_to=ship_to,
        line_items=line_items,
        subtotal=totals.get("subtotal"),
        tax_total=totals.get("tax_total"),
        discount=totals.get("discount"),
        total=totals.get("total"),
        amount_paid=totals.get("amount_paid"),
        balance_due=totals.get("balance_due"),
        raw_ocr_text=raw_text,
        extraction_method="paddleocr+tesseract",
    )

    # Run validation and auto-correction
    result = validator.validate_and_correct(result)

    # Compute confidence scores
    result = validator.compute_confidence(result)

    elapsed = time.time() - start_time
    logger.info(
        "Extraction completed in %.2fs — %d line items, confidence=%.1f%%",
        elapsed,
        len(result.line_items),
        result.confidence.overall,
    )

    return result


# --- Endpoints ---


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    engines = []
    if paddle_engine.is_available():
        engines.append("paddleocr")
    if tesseract_engine.is_available():
        engines.append("tesseract")
    return HealthResponse(status="ok", engines=engines)


@app.post("/api/ocr/extract", response_model=OcrExtractionResult)
async def extract_from_file(file: UploadFile = File(...)):
    """Extract invoice data from uploaded file (image or PDF)."""
    if not file.content_type:
        raise HTTPException(status_code=400, detail="Missing content type")

    content_type = file.content_type.lower()
    if content_type not in ALLOWED_IMAGE_TYPES and content_type not in ALLOWED_PDF_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {content_type}. Supported: JPEG, PNG, TIFF, WebP, BMP, GIF, PDF",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large (max {MAX_FILE_SIZE // 1024 // 1024}MB)")

    # Convert PDF to image
    if content_type in ALLOWED_PDF_TYPES:
        file_bytes = _pdf_to_image(file_bytes)

    try:
        result = _extract_from_bytes(file_bytes)
        return result
    except Exception:
        logger.exception("Extraction failed")
        raise HTTPException(status_code=500, detail="Extraction failed")


@app.post("/api/ocr/extract-base64", response_model=OcrExtractionResult)
async def extract_from_base64(request: Base64Request):
    """Extract invoice data from base64-encoded image."""
    try:
        # Strip data URI prefix if present
        image_data = request.image
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        file_bytes = base64.b64decode(image_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"Image too large (max {MAX_FILE_SIZE // 1024 // 1024}MB)")

    try:
        result = _extract_from_bytes(file_bytes)
        return result
    except Exception:
        logger.exception("Extraction failed")
        raise HTTPException(status_code=500, detail="Extraction failed")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=7001)
