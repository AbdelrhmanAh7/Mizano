import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import * as Tesseract from 'tesseract.js';

export interface ExtractedInvoiceData {
  date: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  invoiceNumber: string | null;
  vendorName: string | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  ocrConfidence: number;
  rawText: string;
  fieldConfidence: Record<string, number>;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingBillId: string | null;
  similarity: number;
  matchType: 'exact_number' | 'amount_date' | 'none';
}

export interface VendorLayoutHint {
  dateRegion?: { x: number; y: number; width: number; height: number };
  totalRegion?: { x: number; y: number; width: number; height: number };
  lineItemsRegion?: { x: number; y: number; width: number; height: number };
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  // Date patterns
  private readonly DATE_PATTERNS = [
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g, // DD/MM/YYYY or MM/DD/YYYY
    /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g, // YYYY/MM/DD
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/gi, // DD Month YYYY
    /(\d{1,2})[\/\-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\/\-](\d{4})/gi, // DD-Mon-YYYY
  ];

  // Currency patterns
  private readonly CURRENCY_PATTERN = /[\$€£¥]?\s*[\d,]+\.?\d*/g;

  constructor(private prisma: PrismaService) {}

  /**
   * Extract data from an invoice image
   */
  async extractFromImage(
    imageBuffer: Buffer,
    language: string = 'eng+ara',
  ): Promise<ExtractedInvoiceData> {
    this.logger.log('Starting OCR extraction');

    try {
      // Perform OCR
      const result = await Tesseract.recognize(imageBuffer, language, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            this.logger.debug(`OCR progress: ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      const rawText = result.data.text;
      const ocrConfidence = result.data.confidence / 100;

      this.logger.log(
        `OCR completed with confidence: ${(ocrConfidence * 100).toFixed(1)}%`,
      );

      // Extract fields
      const lines = rawText.split('\n').filter((l) => l.trim());
      const fieldConfidence: Record<string, number> = {};

      const date = this.extractDate(rawText);
      fieldConfidence['date'] = date ? 0.8 : 0;

      const total = this.extractTotal(rawText);
      fieldConfidence['total'] = total !== null ? 0.85 : 0;

      const subtotal = this.extractSubtotal(rawText);
      fieldConfidence['subtotal'] = subtotal !== null ? 0.75 : 0;

      const tax = this.extractTax(rawText);
      fieldConfidence['tax'] = tax !== null ? 0.7 : 0;

      const invoiceNumber = this.extractInvoiceNumber(rawText);
      fieldConfidence['invoiceNumber'] = invoiceNumber ? 0.9 : 0;

      const vendorName = this.extractVendorName(lines);
      fieldConfidence['vendorName'] = vendorName ? 0.6 : 0;

      const lineItems = this.extractLineItems(lines);
      fieldConfidence['lineItems'] = lineItems.length > 0 ? 0.65 : 0;

      return {
        date,
        total,
        subtotal,
        tax,
        invoiceNumber,
        vendorName,
        lineItems,
        ocrConfidence,
        rawText,
        fieldConfidence,
      };
    } catch (error) {
      this.logger.error(`OCR extraction failed: ${error}`);
      throw error;
    }
  }

  /**
   * Extract date from text
   */
  private extractDate(text: string): string | null {
    for (const pattern of this.DATE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        try {
          return this.parseDate(match[0]);
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  /**
   * Parse date string to ISO format
   */
  private parseDate(dateStr: string): string {
    const monthMap: Record<string, string> = {
      jan: '01',
      feb: '02',
      mar: '03',
      apr: '04',
      may: '05',
      jun: '06',
      jul: '07',
      aug: '08',
      sep: '09',
      oct: '10',
      nov: '11',
      dec: '12',
    };

    // Try DD/MM/YYYY format
    let match = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (match) {
      const [, day, month, year] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // Try YYYY/MM/DD format
    match = dateStr.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // Try DD Month YYYY format
    match = dateStr.match(
      /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i,
    );
    if (match) {
      const [, day, monthName, year] = match;
      const month = monthMap[monthName.toLowerCase().slice(0, 3)];
      return `${year}-${month}-${day.padStart(2, '0')}`;
    }

    throw new Error('Could not parse date');
  }

  /**
   * Extract total amount from text
   */
  private extractTotal(text: string): number | null {
    // Try to find total with keyword
    const patterns = [
      /(?:grand\s*)?total[\s:$€£¥]*([0-9,]+\.?\d*)/i,
      /amount\s*(?:due|payable)[\s:$€£¥]*([0-9,]+\.?\d*)/i,
      /balance\s*(?:due)?[\s:$€£¥]*([0-9,]+\.?\d*)/i,
      /المجموع[\s:]*([0-9,]+\.?\d*)/i, // Arabic "Total"
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return this.parseAmount(match[1]);
      }
    }

    // Fallback: find largest number that looks like currency
    const amounts = this.extractAllAmounts(text);
    if (amounts.length > 0) {
      return Math.max(...amounts);
    }

    return null;
  }

  /**
   * Extract subtotal from text
   */
  private extractSubtotal(text: string): number | null {
    const patterns = [
      /sub.?total[\s:$€£¥]*([0-9,]+\.?\d*)/i,
      /amount\s*(?:before\s*tax)?[\s:$€£¥]*([0-9,]+\.?\d*)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return this.parseAmount(match[1]);
      }
    }

    return null;
  }

  /**
   * Extract tax amount from text
   */
  private extractTax(text: string): number | null {
    const patterns = [
      /(?:tax|vat|gst|hst)[\s:$€£¥]*([0-9,]+\.?\d*)/i,
      /ضريبة[\s:]*([0-9,]+\.?\d*)/i, // Arabic "Tax"
      /(?:tax|vat)\s*\(?\d+%?\)?[\s:$€£¥]*([0-9,]+\.?\d*)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return this.parseAmount(match[1]);
      }
    }

    return null;
  }

  /**
   * Extract invoice number from text
   */
  private extractInvoiceNumber(text: string): string | null {
    const patterns = [
      /inv(?:oice)?[\s#:]*([A-Z0-9\-]+)/i,
      /bill[\s#:]*([A-Z0-9\-]+)/i,
      /ref(?:erence)?[\s#:]*([A-Z0-9\-]+)/i,
      /#\s*([A-Z0-9\-]{3,})/i,
      /no\.?[\s:]*([A-Z0-9\-]+)/i,
      /فاتورة[\s#:]*([A-Z0-9\-]+)/i, // Arabic "Invoice"
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const num = match[1].trim();
        if (num.length >= 3) {
          return num;
        }
      }
    }

    return null;
  }

  /**
   * Extract vendor name from first few lines
   */
  private extractVendorName(lines: string[]): string | null {
    // Take first 5 non-empty lines
    const headerLines = lines.slice(0, 5).filter((l) => {
      const trimmed = l.trim();
      // Skip lines that are mostly numbers or dates
      if (/^\d+[\/\-\.]\d+[\/\-\.]\d+$/.test(trimmed)) return false;
      if (/^[\d\s,.$€£¥]+$/.test(trimmed)) return false;
      if (trimmed.length < 3) return false;
      return true;
    });

    if (headerLines.length === 0) return null;

    // Return the longest line that looks like a company name
    const candidates = headerLines.filter((l) => {
      const trimmed = l.trim();
      // Should contain at least some letters
      return /[a-zA-Z\u0600-\u06FF]{2,}/.test(trimmed);
    });

    if (candidates.length === 0) return null;

    // Return first candidate (usually company name is at top)
    return candidates[0].trim();
  }

  /**
   * Extract line items from invoice
   */
  private extractLineItems(
    lines: string[],
  ): Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }> {
    const items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }> = [];

    // Look for table-like patterns: qty x price or description + numbers
    const lineItemPattern =
      /(.+?)\s+(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i;
    const simplePattern =
      /(.+?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)/;

    for (const line of lines) {
      // Try qty x price pattern
      let match = line.match(lineItemPattern);
      if (match) {
        const [, description, qty, price] = match;
        const quantity = parseFloat(qty);
        const unitPrice = this.parseAmount(price);
        items.push({
          description: description.trim(),
          quantity,
          unitPrice,
          total: quantity * unitPrice,
        });
        continue;
      }

      // Try description + qty + price + total pattern
      match = line.match(simplePattern);
      if (match) {
        const [, description, qty, price, total] = match;
        items.push({
          description: description.trim(),
          quantity: parseFloat(qty.replace(/,/g, '')),
          unitPrice: this.parseAmount(price),
          total: this.parseAmount(total),
        });
      }
    }

    return items;
  }

  /**
   * Parse amount string to number
   */
  private parseAmount(amountStr: string): number {
    // Remove currency symbols and spaces
    const cleaned = amountStr.replace(/[\$€£¥\s]/g, '').replace(/,/g, '');
    return parseFloat(cleaned) || 0;
  }

  /**
   * Extract all amounts from text
   */
  private extractAllAmounts(text: string): number[] {
    const matches = text.match(this.CURRENCY_PATTERN) || [];
    return matches
      .map((m) => this.parseAmount(m))
      .filter((n) => n > 0 && n < 10000000); // Filter unrealistic amounts
  }

  /**
   * Check for duplicate bills
   */
  async checkDuplicate(
    organizationId: string,
    vendorId: string | null,
    invoiceNumber: string | null,
    amount: number | null,
  ): Promise<DuplicateCheckResult> {
    if (!vendorId || (!invoiceNumber && !amount)) {
      return { isDuplicate: false, existingBillId: null, similarity: 0, matchType: 'none' };
    }

    // Check for exact invoice number match
    if (invoiceNumber) {
      const exactMatch = await this.prisma.bill.findFirst({
        where: {
          organizationId,
          vendorId,
          billNumber: invoiceNumber,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (exactMatch) {
        return {
          isDuplicate: true,
          existingBillId: exactMatch.id,
          similarity: 1.0,
          matchType: 'exact_number',
        };
      }
    }

    // Check for same vendor + amount within 3 days
    if (amount) {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const amountMatch = await this.prisma.bill.findFirst({
        where: {
          organizationId,
          vendorId,
          grandTotal: new Decimal(amount),
          createdAt: { gte: threeDaysAgo },
          deletedAt: null,
        },
        select: { id: true },
      });

      if (amountMatch) {
        return {
          isDuplicate: true,
          existingBillId: amountMatch.id,
          similarity: 0.9,
          matchType: 'amount_date',
        };
      }
    }

    return { isDuplicate: false, existingBillId: null, similarity: 0, matchType: 'none' };
  }

  /**
   * Learn vendor layout from corrections
   */
  async learnLayout(
    organizationId: string,
    vendorId: string,
    corrections: Partial<ExtractedInvoiceData>,
  ): Promise<void> {
    // Get existing layout
    const existing = await this.prisma.vendorOcrLayout.findUnique({
      where: {
        organizationId_vendorId: {
          organizationId,
          vendorId,
        },
      },
    });

    const fieldPositions = (existing?.fieldPositions as any) || {};

    // Update field positions based on corrections
    // This is simplified - in production you'd store actual image coordinates
    if (corrections.date) {
      fieldPositions.date = { pattern: corrections.date, learned: true };
    }
    if (corrections.total) {
      fieldPositions.total = { value: corrections.total, learned: true };
    }
    if (corrections.invoiceNumber) {
      fieldPositions.invoiceNumber = {
        pattern: corrections.invoiceNumber,
        learned: true,
      };
    }

    await this.prisma.vendorOcrLayout.upsert({
      where: {
        organizationId_vendorId: {
          organizationId,
          vendorId,
        },
      },
      update: {
        fieldPositions,
        sampleCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
      create: {
        organizationId,
        vendorId,
        fieldPositions,
        sampleCount: 1,
      },
    });

    this.logger.debug(`Updated OCR layout for vendor ${vendorId}`);
  }

  /**
   * Get vendor layout hints
   */
  async getVendorLayoutHints(
    organizationId: string,
    vendorId: string,
  ): Promise<any | null> {
    const layout = await this.prisma.vendorOcrLayout.findUnique({
      where: {
        organizationId_vendorId: {
          organizationId,
          vendorId,
        },
      },
    });

    if (!layout || layout.sampleCount < 3) {
      return null;
    }

    return layout.fieldPositions;
  }

  /**
   * Extract with vendor-specific hints
   */
  async extractWithVendorHints(
    organizationId: string,
    vendorId: string,
    imageBuffer: Buffer,
    language: string = 'eng+ara',
  ): Promise<ExtractedInvoiceData> {
    // First, do standard extraction
    const result = await this.extractFromImage(imageBuffer, language);

    // Get vendor hints
    const hints = await this.getVendorLayoutHints(organizationId, vendorId);

    if (!hints) {
      return result;
    }

    // Apply hints to improve confidence
    if (hints.date?.learned && !result.date) {
      // Try vendor-specific date pattern
      result.fieldConfidence['date'] = 0.5;
    }

    if (hints.total?.learned && result.total) {
      result.fieldConfidence['total'] = Math.min(
        1,
        result.fieldConfidence['total'] + 0.1,
      );
    }

    if (hints.invoiceNumber?.learned && result.invoiceNumber) {
      result.fieldConfidence['invoiceNumber'] = Math.min(
        1,
        result.fieldConfidence['invoiceNumber'] + 0.1,
      );
    }

    return result;
  }
}
