"""Pydantic models for invoice annotations — mirrors the VLM output schema."""

from pydantic import BaseModel, Field


class AnnotationLineItem(BaseModel):
    description: str = ""
    quantity: float = 1.0
    unit_price: float = 0.0
    total: float = 0.0
    tax_rate: float | None = None


class AnnotationAccountingEntry(BaseModel):
    debit_account: str | None = None
    credit_account: str | None = None
    tax_account: str | None = None


class AnnotationConfidence(BaseModel):
    overall: float = Field(default=1.0, ge=0.0, le=1.0)
    vendor_name: float = Field(default=1.0, ge=0.0, le=1.0)
    invoice_date: float = Field(default=1.0, ge=0.0, le=1.0)
    total_amount: float = Field(default=1.0, ge=0.0, le=1.0)
    line_items: float = Field(default=1.0, ge=0.0, le=1.0)


class AnnotationGroundTruth(BaseModel):
    """Ground truth matching the VLM JSON output schema exactly."""

    vendor_name: str | None = None
    vendor_tax_id: str | None = None
    customer_name: str | None = None
    invoice_number: str | None = None
    invoice_date: str | None = None  # YYYY-MM-DD
    due_date: str | None = None
    currency: str | None = None  # 3-letter ISO
    subtotal: float | None = None
    tax_amount: float | None = None
    total_amount: float | None = None
    payment_terms: str | None = None
    items: list[AnnotationLineItem] = []
    notes: str | None = None
    accounting_entry: AnnotationAccountingEntry | None = None
    confidence: AnnotationConfidence = AnnotationConfidence()


class AnnotationEntry(BaseModel):
    """Single annotated document with metadata."""

    file: str  # Filename in test-data/
    description: str = ""
    language: str = "ar"  # Primary language: ar, en, mixed
    quality: str = "good"  # good, faded, low-res
    needs_manual_review: bool = False
    ground_truth: AnnotationGroundTruth


class AnnotationDataset(BaseModel):
    """Root container for all annotations."""

    version: str = "1.0"
    source: str = "ground-truth.ts"
    total_files: int = 0
    annotated_files: int = 0
    entries: list[AnnotationEntry] = []
