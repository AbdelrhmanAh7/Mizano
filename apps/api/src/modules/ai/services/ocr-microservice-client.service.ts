import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExtractedInvoiceData } from './ocr.service';

/**
 * Response shape from the Python OCR microservice POST /api/ocr/extract
 */
interface PythonOcrResponse {
  document_type: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string | null;
  vendor: {
    name: string | null;
    address: string | null;
    tax_id: string | null;
    phone: string | null;
    email: string | null;
  };
  bill_to: { name: string | null; address: string | null };
  ship_to: { name: string | null; address: string | null };
  line_items: Array<{
    line_number: number;
    description: string;
    quantity: number;
    unit_price: number;
    taxable_amount: number | null;
    tax_rate_percent: number | null;
    tax_amount: number | null;
    line_total: number;
  }>;
  subtotal: number | null;
  tax_total: number | null;
  discount: number | null;
  total: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  confidence: {
    overall: number;
    invoice_number: number;
    dates: number;
    vendor: number;
    line_items: number;
    totals: number;
  };
  validation: {
    all_passed: boolean;
    checks: Array<{ name: string; passed: boolean; detail: string }>;
    corrections_applied: string[];
  };
  raw_ocr_text: string;
  extraction_method: string;
}

export interface OcrMicroserviceResult {
  extractedData: ExtractedInvoiceData;
  rawText: string;
  detailedConfidence: {
    overall: number;
    invoice_number: number;
    dates: number;
    vendor: number;
    line_items: number;
    totals: number;
  };
  validationResults: {
    all_passed: boolean;
    checks: Array<{ name: string; passed: boolean; detail: string }>;
    corrections_applied: string[];
  };
}

@Injectable()
export class OcrMicroserviceClient {
  private readonly logger = new Logger(OcrMicroserviceClient.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private healthyUntil = 0; // timestamp until which we skip health checks
  private knownDown = false;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('OCR_SERVICE_URL') || 'http://localhost:7001';
    this.timeoutMs = parseInt(
      this.configService.get<string>('OCR_SERVICE_TIMEOUT_MS') || '60000',
      10,
    );
  }

  /**
   * Check if the Python OCR microservice is reachable.
   * Caches health status for 30 seconds.
   */
  async isHealthy(): Promise<boolean> {
    if (this.knownDown && Date.now() < this.healthyUntil) {
      return false;
    }
    if (!this.knownDown && Date.now() < this.healthyUntil) {
      return true;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${this.baseUrl}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        this.knownDown = false;
        this.healthyUntil = Date.now() + 30_000;
        return true;
      }
    } catch {
      // Service unreachable
    }

    this.knownDown = true;
    this.healthyUntil = Date.now() + 30_000;
    return false;
  }

  /**
   * Send file to Python OCR microservice and return mapped result.
   * Returns null if service is unavailable or extraction fails.
   */
  async extract(
    fileBuffer: Buffer,
    mimeType: string,
    filename?: string,
  ): Promise<OcrMicroserviceResult | null> {
    const healthy = await this.isHealthy();
    if (!healthy) {
      this.logger.debug('Python OCR microservice is not available, skipping');
      return null;
    }

    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
      formData.append('file', blob, filename || 'document');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(`${this.baseUrl}/api/ocr/extract`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text().catch(() => 'unknown error');
        this.logger.warn(`Python OCR service returned ${res.status}: ${errText}`);
        return null;
      }

      const data: PythonOcrResponse = await res.json();
      return this.mapToInternal(data);
    } catch (error) {
      this.logger.warn(`Python OCR extraction failed: ${error}`);
      return null;
    }
  }

  /**
   * Map the Python microservice response to the internal ExtractedInvoiceData format.
   */
  private mapToInternal(data: PythonOcrResponse): OcrMicroserviceResult {
    const lineItems = data.line_items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      total: item.line_total,
      taxableAmount: item.taxable_amount,
      taxRatePercent: item.tax_rate_percent,
      taxAmount: item.tax_amount,
    }));

    // Build per-field confidence (0-1 scale, matching existing contract)
    const fieldConfidence: Record<string, number> = {
      date: data.confidence.dates / 100,
      dueDate: data.confidence.dates / 100,
      total: data.confidence.totals / 100,
      subtotal: data.confidence.totals / 100,
      tax: data.confidence.totals / 100,
      invoiceNumber: data.confidence.invoice_number / 100,
      vendorName: data.confidence.vendor / 100,
      lineItems: data.confidence.line_items / 100,
    };

    const extractedData: ExtractedInvoiceData = {
      date: data.invoice_date,
      dueDate: data.due_date,
      paymentTerms: null,
      currency: data.currency,
      total: data.total,
      subtotal: data.subtotal,
      tax: data.tax_total,
      invoiceNumber: data.invoice_number,
      vendorName: data.vendor.name,
      lineItems,
      ocrConfidence: data.confidence.overall / 100,
      rawText: data.raw_ocr_text,
      fieldConfidence,
    };

    return {
      extractedData,
      rawText: data.raw_ocr_text,
      detailedConfidence: data.confidence,
      validationResults: data.validation,
    };
  }
}
