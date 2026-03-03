from pydantic import BaseModel, Field


class VendorInfo(BaseModel):
    name: str | None = None
    address: str | None = None
    tax_id: str | None = None
    phone: str | None = None
    email: str | None = None


class PartyInfo(BaseModel):
    name: str | None = None
    address: str | None = None
    tax_id: str | None = None


class ShipToInfo(BaseModel):
    name: str | None = None
    address: str | None = None


class InvoiceLineItem(BaseModel):
    line_number: int | None = None
    description: str = ""
    quantity: float = 1.0
    unit_price: float = 0.0
    taxable_amount: float | None = None
    tax_rate_percent: float | None = None
    tax_amount: float | None = None
    line_total: float = 0.0


class AccountingEntry(BaseModel):
    debit_account: str | None = None
    credit_account: str | None = None
    tax_account: str | None = None


class ConfidenceScores(BaseModel):
    overall: float = Field(default=0.0, ge=0.0, le=1.0)
    vendor_name: float = Field(default=0.0, ge=0.0, le=1.0)
    invoice_date: float = Field(default=0.0, ge=0.0, le=1.0)
    total_amount: float = Field(default=0.0, ge=0.0, le=1.0)
    line_items: float = Field(default=0.0, ge=0.0, le=1.0)


class InvoiceExtractionResult(BaseModel):
    document_type: str | None = None
    invoice_number: str | None = None
    invoice_date: str | None = None
    due_date: str | None = None
    currency: str | None = None
    payment_terms: str | None = None
    vendor: VendorInfo = Field(default_factory=VendorInfo)
    bill_to: PartyInfo = Field(default_factory=PartyInfo)
    ship_to: ShipToInfo = Field(default_factory=ShipToInfo)
    line_items: list[InvoiceLineItem] = []
    subtotal: float | None = None
    tax_total: float | None = None
    discount: float | None = None
    total: float | None = None
    amount_paid: float | None = None
    balance_due: float | None = None
    notes: str | None = None
    accounting_entry: AccountingEntry | None = None
    confidence: ConfidenceScores = Field(default_factory=ConfidenceScores)
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
