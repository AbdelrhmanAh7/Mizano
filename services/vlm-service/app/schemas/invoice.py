from pydantic import BaseModel, Field


class InvoiceLineItem(BaseModel):
    description: str = ""
    quantity: float = 1.0
    unit_price: float = 0.0
    total: float = 0.0
    tax_rate: float | None = None


class AccountingEntry(BaseModel):
    debit_account: str | None = None  # e.g., "Purchases", "Office Supplies", "Fixed Assets"
    credit_account: str | None = None  # e.g., "Accounts Payable"
    tax_account: str | None = None  # e.g., "Input VAT"


class ConfidenceScores(BaseModel):
    overall: float = Field(default=0.0, ge=0.0, le=1.0)
    vendor_name: float = Field(default=0.0, ge=0.0, le=1.0)
    invoice_date: float = Field(default=0.0, ge=0.0, le=1.0)
    total_amount: float = Field(default=0.0, ge=0.0, le=1.0)
    line_items: float = Field(default=0.0, ge=0.0, le=1.0)


class InvoiceExtractionResult(BaseModel):
    vendor_name: str | None = None
    vendor_tax_id: str | None = None
    customer_name: str | None = None
    invoice_number: str | None = None
    invoice_date: str | None = None  # ISO format: YYYY-MM-DD
    due_date: str | None = None
    currency: str | None = None  # 3-letter ISO code
    subtotal: float | None = None
    tax_amount: float | None = None
    total_amount: float | None = None
    payment_terms: str | None = None
    items: list[InvoiceLineItem] = []
    notes: str | None = None
    accounting_entry: AccountingEntry | None = None
    confidence: ConfidenceScores = ConfidenceScores()
    raw_text: str | None = None
    processing_time_ms: float = 0.0


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_name: str
    gpu_memory_used_mb: float | None = None
    gpu_memory_total_mb: float | None = None


class ProcessInvoiceResponse(BaseModel):
    success: bool
    data: InvoiceExtractionResult | None = None
    error: str | None = None
