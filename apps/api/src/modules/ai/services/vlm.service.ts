import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { ExtractedInvoiceData } from './ocr.service';
import { VlmExtractionResult, VlmLineItem } from '../dto/vlm-extract.dto';
import * as FormData from 'form-data';

@Injectable()
export class VlmService {
  private readonly logger = new Logger(VlmService.name);
  private readonly vlmBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly enabled: boolean;

  // Health cache: avoid hitting /health on every request
  private lastHealthCheck: { healthy: boolean; timestamp: number } | null = null;
  private readonly HEALTH_CACHE_TTL = 30_000; // 30 seconds

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.vlmBaseUrl = this.configService.get('VLM_SERVICE_URL', 'http://localhost:8100');
    this.timeoutMs = parseInt(this.configService.get('VLM_TIMEOUT_MS', '120000'), 10);
    this.enabled = this.configService.get('VLM_ENABLED', 'true') !== 'false';
  }

  /**
   * Check if the VLM service is healthy and model is loaded.
   * Result is cached for 30s to avoid hammering the Python service.
   */
  async isHealthy(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    // Return cached result if still fresh
    if (
      this.lastHealthCheck &&
      Date.now() - this.lastHealthCheck.timestamp < this.HEALTH_CACHE_TTL
    ) {
      return this.lastHealthCheck.healthy;
    }

    try {
      const response = await lastValueFrom(
        this.httpService.get(`${this.vlmBaseUrl}/api/v1/health`, {
          timeout: 3000,
        }),
      );
      const healthy = response.data?.model_loaded === true;
      this.lastHealthCheck = { healthy, timestamp: Date.now() };
      return healthy;
    } catch {
      this.lastHealthCheck = { healthy: false, timestamp: Date.now() };
      return false;
    }
  }

  /**
   * Extract invoice fields from an image/PDF buffer using the VLM service.
   * Returns null if the service is unavailable or extraction fails.
   */
  async extractFromImage(
    fileBuffer: Buffer,
    mimeType: string,
    filename?: string,
  ): Promise<VlmExtractionResult | null> {
    if (!this.enabled) {
      return null;
    }

    const healthy = await this.isHealthy();
    if (!healthy) {
      this.logger.debug('VLM service is not healthy, skipping extraction');
      return null;
    }

    try {
      const form = new FormData();
      form.append('file', fileBuffer, {
        filename: filename || 'document',
        contentType: mimeType,
      });

      const response = await lastValueFrom(
        this.httpService.post(`${this.vlmBaseUrl}/api/v1/process-invoice`, form, {
          headers: form.getHeaders(),
          timeout: this.timeoutMs,
        }),
      );

      const body = response.data;
      if (!body?.success) {
        this.logger.warn('VLM service returned success=false');
        return null;
      }

      return this.mapResponseToResult(body.data);
    } catch (error) {
      this.logger.warn(
        `VLM extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Map a VlmExtractionResult to the existing ExtractedInvoiceData interface
   * so it can be consumed by the rest of the pipeline transparently.
   */
  toExtractedInvoiceData(vlm: VlmExtractionResult): ExtractedInvoiceData {
    return {
      date: vlm.invoiceDate,
      dueDate: vlm.dueDate,
      paymentTerms: vlm.paymentTerms,
      currency: vlm.currency,
      total: vlm.totalAmount,
      subtotal: vlm.subtotal,
      tax: vlm.taxAmount,
      invoiceNumber: vlm.invoiceNumber,
      vendorName: vlm.vendorName,
      lineItems: vlm.lineItems.map((item: VlmLineItem) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.lineTotal,
      })),
      ocrConfidence: vlm.confidence.overall,
      rawText: vlm.rawText || '',
      fieldConfidence: {
        vendorName: vlm.confidence.vendorName,
        date: vlm.confidence.invoiceDate,
        total: vlm.confidence.totalAmount,
        lineItems: vlm.confidence.lineItems,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Map the Python service's snake_case response to camelCase VlmExtractionResult.
   */
  private mapResponseToResult(data: Record<string, unknown>): VlmExtractionResult {
    const confidence = (data.confidence as Record<string, number>) || {};
    const vendorRaw = (data.vendor as Record<string, string | null>) || {};
    const billToRaw = (data.bill_to as Record<string, string | null>) || {};
    const shipToRaw = (data.ship_to as Record<string, string | null>) || {};
    // Support both new schema (line_items) and old schema (items) for backward compat
    const rawItems = ((data.line_items ?? data.items) as Array<Record<string, unknown>>) || [];
    const accountingRaw = data.accounting_entry as Record<string, string | null> | null;

    // Resolve vendor name: new schema uses vendor.name, old uses vendor_name
    const vendorName = vendorRaw.name ?? (data.vendor_name as string | null) ?? null;
    const vendorTaxId = vendorRaw.tax_id ?? (data.vendor_tax_id as string | null) ?? null;

    return {
      documentType: (data.document_type as string | null) ?? null,
      vendorName,
      vendorTaxId,
      vendor: {
        name: vendorName,
        address: vendorRaw.address ?? null,
        taxId: vendorTaxId,
        phone: vendorRaw.phone ?? null,
        email: vendorRaw.email ?? null,
      },
      billTo: {
        name: billToRaw.name ?? (data.customer_name as string | null) ?? null,
        address: billToRaw.address ?? null,
        taxId: billToRaw.tax_id ?? null,
      },
      shipTo: {
        name: shipToRaw.name ?? null,
        address: shipToRaw.address ?? null,
      },
      customerName: billToRaw.name ?? (data.customer_name as string | null) ?? null,
      invoiceNumber: (data.invoice_number as string | null) ?? null,
      invoiceDate: (data.invoice_date as string | null) ?? null,
      dueDate: (data.due_date as string | null) ?? null,
      currency: (data.currency as string | null) ?? null,
      paymentTerms: (data.payment_terms as string | null) ?? null,
      subtotal: (data.subtotal as number | null) ?? null,
      // Support both new schema (tax_total) and old schema (tax_amount)
      taxAmount: (data.tax_total as number | null) ?? (data.tax_amount as number | null) ?? null,
      // Support both new schema (total) and old schema (total_amount)
      totalAmount: (data.total as number | null) ?? (data.total_amount as number | null) ?? null,
      discount: (data.discount as number | null) ?? null,
      amountPaid: (data.amount_paid as number | null) ?? null,
      balanceDue: (data.balance_due as number | null) ?? null,
      lineItems: rawItems.map((item) => ({
        lineNumber: (item.line_number as number | null) ?? null,
        description: (item.description as string) || '',
        quantity: (item.quantity as number) ?? 1,
        unitPrice: (item.unit_price as number) ?? 0,
        taxableAmount: (item.taxable_amount as number | null) ?? null,
        // Support both new schema (tax_rate_percent) and old schema (tax_rate)
        taxRatePercent:
          (item.tax_rate_percent as number | null) ?? (item.tax_rate as number | null) ?? null,
        taxAmount: (item.tax_amount as number | null) ?? null,
        // Support both new schema (line_total) and old schema (total)
        lineTotal: (item.line_total as number) ?? (item.total as number) ?? 0,
      })),
      notes: (data.notes as string | null) ?? null,
      accountingEntry: accountingRaw
        ? {
            debitAccount: accountingRaw.debit_account ?? null,
            creditAccount: accountingRaw.credit_account ?? null,
            taxAccount: accountingRaw.tax_account ?? null,
          }
        : null,
      confidence: {
        overall: confidence.overall ?? 0,
        vendorName: confidence.vendor_name ?? 0,
        invoiceDate: confidence.invoice_date ?? 0,
        totalAmount: confidence.total_amount ?? 0,
        lineItems: confidence.line_items ?? 0,
      },
      rawText: (data.raw_text as string | null) ?? null,
      processingTimeMs: (data.processing_time_ms as number) ?? 0,
    };
  }
}
