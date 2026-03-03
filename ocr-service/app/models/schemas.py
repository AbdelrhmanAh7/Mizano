"""Pydantic response models for OCR extraction."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class VendorInfo(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class AddressInfo(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None


class LineItem(BaseModel):
    line_number: int = 0
    description: str = ""
    quantity: float = 0.0
    unit_price: float = 0.0
    taxable_amount: Optional[float] = None
    tax_rate_percent: Optional[float] = None
    tax_amount: Optional[float] = None
    line_total: float = 0.0


class ConfidenceScores(BaseModel):
    overall: float = Field(0.0, ge=0, le=100)
    invoice_number: float = Field(0.0, ge=0, le=100)
    dates: float = Field(0.0, ge=0, le=100)
    vendor: float = Field(0.0, ge=0, le=100)
    line_items: float = Field(0.0, ge=0, le=100)
    totals: float = Field(0.0, ge=0, le=100)


class ValidationCheck(BaseModel):
    name: str
    passed: bool
    detail: str


class ValidationResult(BaseModel):
    all_passed: bool = False
    checks: list[ValidationCheck] = Field(default_factory=list)
    corrections_applied: list[str] = Field(default_factory=list)


class OcrExtractionResult(BaseModel):
    document_type: str = "BILL"
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    currency: Optional[str] = None
    vendor: VendorInfo = Field(default_factory=VendorInfo)
    bill_to: AddressInfo = Field(default_factory=AddressInfo)
    ship_to: AddressInfo = Field(default_factory=AddressInfo)
    line_items: list[LineItem] = Field(default_factory=list)
    subtotal: Optional[float] = None
    tax_total: Optional[float] = None
    discount: Optional[float] = None
    total: Optional[float] = None
    amount_paid: Optional[float] = None
    balance_due: Optional[float] = None
    confidence: ConfidenceScores = Field(default_factory=ConfidenceScores)
    validation: ValidationResult = Field(default_factory=ValidationResult)
    raw_ocr_text: str = ""
    extraction_method: str = "paddleocr+tesseract"


class Base64Request(BaseModel):
    image: str


class HealthResponse(BaseModel):
    status: str = "ok"
    engines: list[str] = Field(default_factory=lambda: ["paddleocr", "tesseract"])


class OcrTextBlock(BaseModel):
    """A single OCR detection: text + bounding box + confidence."""

    text: str
    bbox: list[list[float]]  # [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
    confidence: float
    x_center: float = 0.0
    y_center: float = 0.0
    x_min: float = 0.0
    x_max: float = 0.0
    y_min: float = 0.0
    y_max: float = 0.0

    def model_post_init(self, __context: object) -> None:
        if self.bbox:
            xs = [p[0] for p in self.bbox]
            ys = [p[1] for p in self.bbox]
            self.x_min = min(xs)
            self.x_max = max(xs)
            self.y_min = min(ys)
            self.y_max = max(ys)
            self.x_center = (self.x_min + self.x_max) / 2
            self.y_center = (self.y_min + self.y_max) / 2
