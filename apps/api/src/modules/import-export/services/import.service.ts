import { BadRequestException, Injectable } from '@nestjs/common';
import { CreditNoteType, PaymentMode, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import * as csv from 'csv-parser';
import { Readable } from 'stream';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreditNotesService } from '../../sales/services/credit-notes.service';
import { InvoicesService } from '../../sales/services/invoices.service';
import { PaymentsReceivedService } from '../../sales/services/payments-received.service';
import { BillsService } from '../../purchases/services/bills.service';
import { ExpensesService } from '../../purchases/services/expenses.service';
import { PaymentsMadeService } from '../../purchases/services/payments-made.service';
import { VendorCreditsService } from '../../purchases/services/vendor-credits.service';
import {
  ColumnMappingDto,
  ENTITY_FIELD_DEFINITIONS,
  ImportConfigDto,
  ImportEntityType,
  ImportResultDto,
  ParseFileResultDto,
  ValidationErrorDto,
  ValidationResultDto,
} from '../dto/import-export.dto';
// ofx-js loaded dynamically below (no ESM export)

/** Loosely-typed row coming from CSV/Excel/OFX parsing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ImportRow = Record<string, any>;

type DocumentKind =
  | 'invoice'
  | 'bill'
  | 'expense'
  | 'vendorCredit'
  | 'creditNote'
  | 'paymentMade'
  | 'paymentReceived';

interface RowContext {
  tx: Prisma.TransactionClient;
  marker: string;
}

@Injectable()
export class ImportService {
  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
    private creditNotesService: CreditNotesService,
    private paymentsReceivedService: PaymentsReceivedService,
    private billsService: BillsService,
    private expensesService: ExpensesService,
    private vendorCreditsService: VendorCreditsService,
    private paymentsMadeService: PaymentsMadeService,
  ) {}

  // ============ File Parsing ============

  async parseFile(buffer: Buffer, filename: string): Promise<ParseFileResultDto> {
    const extension = filename.toLowerCase().split('.').pop();

    if (extension === 'csv') {
      return this.parseCsv(buffer);
    } else if (extension === 'xlsx' || extension === 'xls') {
      return this.parseExcel(buffer);
    } else if (extension === 'ofx' || extension === 'qfx') {
      return this.parseOfx(buffer);
    } else {
      throw new BadRequestException(
        'Unsupported file format. Please use CSV, Excel (.xlsx), or OFX/QFX',
      );
    }
  }

  private async parseCsv(buffer: Buffer): Promise<ParseFileResultDto> {
    return new Promise((resolve, reject) => {
      const rows: ImportRow[] = [];
      let headers: string[] = [];

      const stream = Readable.from(buffer.toString());
      stream
        .pipe(csv())
        .on('headers', (h: string[]) => {
          headers = h;
        })
        .on('data', (row: Record<string, string>) => {
          rows.push(row);
        })
        .on('end', () => {
          resolve({
            headers,
            preview: rows.slice(0, 10),
            totalRows: rows.length,
            fileType: 'csv',
          });
        })
        .on('error', reject);
    });
  }

  private parseExcel(buffer: Buffer): ParseFileResultDto {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const data = XLSX.utils.sheet_to_json<ImportRow>(worksheet, {
      header: 1,
    });

    if (data.length === 0) {
      throw new BadRequestException('Excel file is empty');
    }

    const headers = (data[0] as string[]).map((h) => String(h || '').trim());
    const rows = data.slice(1).map((row: unknown[]) => {
      const obj: ImportRow = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });

    return {
      headers,
      preview: rows.slice(0, 10),
      totalRows: rows.length,
      fileType: 'xlsx',
    };
  }

  private async parseOfx(buffer: Buffer): Promise<ParseFileResultDto> {
    const rows = await this.getOfxRows(buffer);
    const headers = ['date', 'description', 'amount', 'reference', 'type'];

    return {
      headers,
      preview: rows.slice(0, 10),
      totalRows: rows.length,
      fileType: 'csv' as const,
    };
  }

  private async getOfxRows(buffer: Buffer): Promise<ImportRow[]> {
    const content = buffer.toString('utf-8');
    const ofxParser = await import('ofx-js');
    const parsed = await ofxParser.parse(content);

    // Extract transactions from OFX structure
    // Bank statements: OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.BANKTRANLIST.STMTTRN
    // Credit card: OFX.CREDITCARDMSGSRSV1.CCSTMTTRNRS.CCSTMTRS.BANKTRANLIST.STMTTRN
    let transactions: ImportRow[] = [];

    const bankTranList =
      parsed?.OFX?.BANKMSGSRSV1?.STMTTRNRS?.STMTRS?.BANKTRANLIST?.STMTTRN ||
      parsed?.OFX?.CREDITCARDMSGSRSV1?.CCSTMTTRNRS?.CCSTMTRS?.BANKTRANLIST?.STMTTRN;

    if (bankTranList) {
      transactions = Array.isArray(bankTranList) ? bankTranList : [bankTranList];
    }

    return transactions.map((txn: ImportRow) => {
      // Parse OFX date format (YYYYMMDDHHMMSS or YYYYMMDD)
      const rawDate = String(txn.DTPOSTED || '');
      const year = rawDate.substring(0, 4);
      const month = rawDate.substring(4, 6);
      const day = rawDate.substring(6, 8);
      const dateStr = `${year}-${month}-${day}`;

      const amount = parseFloat(String(txn.TRNAMT || '0'));
      const type = amount >= 0 ? 'DEPOSIT' : 'WITHDRAWAL';

      return {
        date: dateStr,
        description: txn.NAME || txn.MEMO || '',
        amount: String(amount),
        reference: txn.FITID || '',
        type,
      };
    });
  }

  // ============ Validation ============

  async validateImport(
    organizationId: string,
    buffer: Buffer,
    filename: string,
    config: ImportConfigDto,
  ): Promise<ValidationResultDto> {
    await this.parseFile(buffer, filename);
    const rows = await this.getAllRows(buffer, filename);

    const fieldDefs = ENTITY_FIELD_DEFINITIONS[config.entityType];
    const errors: ValidationErrorDto[] = [];
    const warnings: ValidationErrorDto[] = [];

    let validRows = 0;
    let invalidRows = 0;

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + (config.skipRows ?? 0) + 2; // +2 for header and 1-based index
      const row = rows[i];
      const rowErrors: ValidationErrorDto[] = [];

      // Map columns
      const mappedRow = this.mapRow(row, config.columnMappings);

      // Validate each field
      for (const fieldDef of fieldDefs) {
        const value = mappedRow[fieldDef.field];

        // Required check
        if (fieldDef.required && (value === undefined || value === null || value === '')) {
          rowErrors.push({
            row: rowNum,
            field: fieldDef.field,
            value,
            error: `${fieldDef.label} is required`,
          });
        }

        // Type validation
        if (value !== undefined && value !== null && value !== '') {
          const typeError = this.validateFieldType(fieldDef, value);
          if (typeError) {
            rowErrors.push({
              row: rowNum,
              field: fieldDef.field,
              value,
              error: typeError,
            });
          }
        }
      }

      if (rowErrors.length > 0) {
        invalidRows++;
        errors.push(...rowErrors);
      } else {
        validRows++;
      }
    }

    // Check for duplicates
    const duplicateWarnings = await this.checkDuplicates(organizationId, rows, config);
    warnings.push(...duplicateWarnings);

    return {
      valid: invalidRows === 0,
      totalRows: rows.length,
      validRows,
      invalidRows,
      errors: errors.slice(0, 100), // Limit to first 100 errors
      warnings: warnings.slice(0, 50),
    };
  }

  private validateFieldType(
    fieldDef: { type: string; enumValues?: string[] },
    value: unknown,
  ): string | null {
    switch (fieldDef.type) {
      case 'number':
        if (isNaN(Number(value))) {
          return 'Must be a valid number';
        }
        break;
      case 'decimal':
        if (isNaN(parseFloat(String(value)))) {
          return 'Must be a valid decimal number';
        }
        break;
      case 'date':
        if (isNaN(Date.parse(String(value)))) {
          return 'Must be a valid date (YYYY-MM-DD)';
        }
        break;
      case 'boolean':
        if (!['true', 'false', '1', '0', 'yes', 'no'].includes(String(value).toLowerCase())) {
          return 'Must be true, false, 1, 0, yes, or no';
        }
        break;
      case 'enum':
        if (fieldDef.enumValues && !fieldDef.enumValues.includes(String(value).toUpperCase())) {
          return `Must be one of: ${fieldDef.enumValues.join(', ')}`;
        }
        break;
    }
    return null;
  }

  private async checkDuplicates(
    organizationId: string,
    rows: ImportRow[],
    config: ImportConfigDto,
  ): Promise<ValidationErrorDto[]> {
    const warnings: ValidationErrorDto[] = [];

    if (config.matchField) {
      const matchValues = rows.map(
        (row) => this.mapRow(row, config.columnMappings)[config.matchField!],
      );

      // Check for duplicates within the file
      const seen = new Set<string>();
      matchValues.forEach((value, index) => {
        if (value && seen.has(String(value))) {
          warnings.push({
            row: index + 2,
            field: config.matchField!,
            value,
            error: 'Duplicate value found in file',
          });
        }
        if (value) seen.add(String(value));
      });
    }

    return warnings;
  }

  // ============ Import Execution ============

  async importData(
    organizationId: string,
    buffer: Buffer,
    filename: string,
    config: ImportConfigDto,
  ): Promise<ImportResultDto> {
    // Validate first
    const validation = await this.validateImport(organizationId, buffer, filename, config);
    if (!validation.valid && config.stopOnError) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: validation.errors,
      });
    }

    const rows = await this.getAllRows(buffer, filename);
    // Stable per-row idempotency key: the same file re-run produces the same keys, so money-bearing
    // rows already imported are skipped (see importOnce).
    const fileHash = createHash('sha256').update(buffer).digest('hex');
    const result: ImportResultDto = {
      success: true,
      totalProcessed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    for (let i = config.skipRows ?? 0; i < rows.length; i++) {
      try {
        const mappedRow = this.mapRow(rows[i], config.columnMappings);
        const transformed = this.transformRow(mappedRow, config.entityType);

        const importResult = await this.importSingleRow(
          organizationId,
          config.entityType,
          transformed,
          config.updateExisting,
          config.matchField,
          createHash('sha256')
            .update(`${fileHash}:${config.entityType}:sheet0:${i}`)
            .digest('hex')
            .slice(0, 32),
        );

        result.totalProcessed++;
        if (importResult === 'created') result.created++;
        else if (importResult === 'updated') result.updated++;
        else if (importResult === 'skipped') result.skipped++;
      } catch (error: unknown) {
        result.failed++;
        result.errors.push({
          row: i + 2,
          error: (error as Error).message,
        });

        if (config.stopOnError) {
          result.success = false;
          break;
        }
      }
    }

    return result;
  }

  private async importSingleRow(
    organizationId: string,
    entityType: ImportEntityType,
    data: ImportRow,
    updateExisting: boolean = false,
    matchField?: string,
    rowKey: string = createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 32),
  ): Promise<'created' | 'updated' | 'skipped'> {
    switch (entityType) {
      case ImportEntityType.CUSTOMERS:
        return this.importCustomer(organizationId, data, updateExisting, matchField);
      case ImportEntityType.VENDORS:
        return this.importVendor(organizationId, data, updateExisting, matchField);
      case ImportEntityType.ITEMS:
        return this.importItem(organizationId, data, updateExisting, matchField);
      case ImportEntityType.ACCOUNTS:
        return this.importAccount(organizationId, data, updateExisting, matchField);
      case ImportEntityType.EMPLOYEES:
        return this.importEmployee(organizationId, data, updateExisting, matchField);
      case ImportEntityType.BANK_TRANSACTIONS:
        return this.importBankTransaction(organizationId, data);
      case ImportEntityType.INVOICES:
        return this.importOnce(organizationId, 'invoice', rowKey, (ctx) =>
          this.importInvoice(organizationId, data, ctx),
        );
      case ImportEntityType.QUOTES:
        return this.importQuote(organizationId, data);
      case ImportEntityType.CREDIT_NOTES:
        return this.importOnce(organizationId, 'creditNote', rowKey, (ctx) =>
          this.importCreditNote(organizationId, data, ctx),
        );
      case ImportEntityType.PAYMENTS_RECEIVED:
        return this.importOnce(organizationId, 'paymentReceived', rowKey, (ctx) =>
          this.importPaymentReceived(organizationId, data, ctx),
        );
      case ImportEntityType.DELIVERY_CHALLANS:
        return this.importDeliveryChallan(organizationId, data);
      case ImportEntityType.BILLS:
        return this.importOnce(organizationId, 'bill', rowKey, (ctx) =>
          this.importBill(organizationId, data, ctx),
        );
      case ImportEntityType.EXPENSES:
        return this.importOnce(organizationId, 'expense', rowKey, (ctx) =>
          this.importExpense(organizationId, data, ctx),
        );
      case ImportEntityType.VENDOR_CREDITS:
        return this.importOnce(organizationId, 'vendorCredit', rowKey, (ctx) =>
          this.importVendorCredit(organizationId, data, ctx),
        );
      case ImportEntityType.PAYMENTS_MADE:
        return this.importOnce(organizationId, 'paymentMade', rowKey, (ctx) =>
          this.importPaymentMade(organizationId, data, ctx),
        );
      default:
        throw new BadRequestException(`Import for ${entityType} not yet implemented`);
    }
  }

  private async importCustomer(
    organizationId: string,
    data: ImportRow,
    updateExisting: boolean,
    matchField?: string,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const matchValue = matchField ? data[matchField] : data.email;

    if (matchValue && updateExisting) {
      const existing = await this.prisma.customer.findFirst({
        where: {
          organizationId,
          [matchField || 'email']: matchValue,
          deletedAt: null,
        },
      });

      if (existing) {
        await this.prisma.customer.update({
          where: { id: existing.id },
          data: {
            name: data.name || existing.name,
            email: data.email || existing.email,
            phone: data.phone || existing.phone,
            address: data.address || existing.address,
            city: data.city || existing.city,
            country: data.country || existing.country,
            taxId: data.taxId || existing.taxId,
            paymentTerms: data.paymentTerms || existing.paymentTerms,
            creditLimit: data.creditLimit ? new Decimal(data.creditLimit) : existing.creditLimit,
          },
        });
        return 'updated';
      }
    }

    await this.prisma.customer.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        city: data.city,
        country: data.country,
        taxId: data.taxId,
        paymentTerms: data.paymentTerms,
        creditLimit: data.creditLimit ? new Decimal(data.creditLimit) : undefined,
        organizationId,
      },
    });
    return 'created';
  }

  private async importVendor(
    organizationId: string,
    data: ImportRow,
    updateExisting: boolean,
    matchField?: string,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const matchValue = matchField ? data[matchField] : data.email;

    if (matchValue && updateExisting) {
      const existing = await this.prisma.vendor.findFirst({
        where: {
          organizationId,
          [matchField || 'email']: matchValue,
          deletedAt: null,
        },
      });

      if (existing) {
        await this.prisma.vendor.update({
          where: { id: existing.id },
          data: {
            name: data.name || existing.name,
            email: data.email || existing.email,
            phone: data.phone || existing.phone,
            address: data.address || existing.address,
            city: data.city || existing.city,
            country: data.country || existing.country,
            taxId: data.taxId || existing.taxId,
            paymentTerms: data.paymentTerms || existing.paymentTerms,
            bankName: data.bankName || existing.bankName,
            bankAccount: data.bankAccount || existing.bankAccount,
          },
        });
        return 'updated';
      }
    }

    await this.prisma.vendor.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        city: data.city,
        country: data.country,
        taxId: data.taxId,
        paymentTerms: data.paymentTerms,
        bankName: data.bankName,
        bankAccount: data.bankAccount,
        organizationId,
      },
    });
    return 'created';
  }

  private async importItem(
    organizationId: string,
    data: ImportRow,
    updateExisting: boolean,
    matchField?: string,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const matchValue = matchField ? data[matchField] : data.sku;

    if (matchValue && updateExisting) {
      const existing = await this.prisma.item.findFirst({
        where: {
          organizationId,
          [matchField || 'sku']: matchValue,
          deletedAt: null,
        },
      });

      if (existing) {
        await this.prisma.item.update({
          where: { id: existing.id },
          data: {
            name: data.name || existing.name,
            description: data.description || existing.description,
            salesPrice: data.salesPrice ? new Decimal(data.salesPrice) : existing.salesPrice,
            purchasePrice: data.purchasePrice
              ? new Decimal(data.purchasePrice)
              : existing.purchasePrice,
            unit: data.unit || existing.unit,
            taxRate: data.taxRate ? new Decimal(data.taxRate) : existing.taxRate,
            trackInventory: data.trackInventory ?? existing.trackInventory,
            reorderLevel: data.reorderLevel || existing.reorderLevel,
          },
        });
        return 'updated';
      }
    }

    await this.prisma.item.create({
      data: {
        name: data.name,
        sku: data.sku,
        type: (data.type || 'GOODS').toUpperCase(),
        description: data.description,
        salesPrice: data.salesPrice ? new Decimal(data.salesPrice) : undefined,
        purchasePrice: data.purchasePrice ? new Decimal(data.purchasePrice) : undefined,
        unit: data.unit,
        taxRate: data.taxRate ? new Decimal(data.taxRate) : undefined,
        trackInventory: data.trackInventory ?? true,
        reorderLevel: data.reorderLevel,
        organizationId,
      },
    });
    return 'created';
  }

  private async importAccount(
    organizationId: string,
    data: ImportRow,
    updateExisting: boolean,
    matchField?: string,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const matchValue = matchField ? data[matchField] : data.code;

    if (matchValue && updateExisting) {
      const existing = await this.prisma.account.findFirst({
        where: {
          organizationId,
          [matchField || 'code']: matchValue,
        },
      });

      if (existing) {
        await this.prisma.account.update({
          where: { id: existing.id },
          data: {
            name: data.name || existing.name,
            description: data.description || existing.description,
            isActive: data.isActive ?? existing.isActive,
          },
        });
        return 'updated';
      }
    }

    // An opening balance is a ledger event (Dr/Cr against the opening-balance equity), not a
    // column: it is entered through the Opening Balances command so it posts a journal.
    const openingBalance = this.cell(data.openingBalance);
    if (openingBalance && !/^0+(\.0+)?$/.test(openingBalance)) {
      throw new BadRequestException(
        'openingBalance cannot be imported with accounts; enter opening balances in Accounting > Opening Balances so they are posted to the ledger',
      );
    }

    // Find parent account if provided
    let parentId: string | undefined;
    if (data.parentCode) {
      const parent = await this.prisma.account.findFirst({
        where: { organizationId, code: data.parentCode },
      });
      parentId = parent?.id;
    }

    await this.prisma.account.create({
      data: {
        name: data.name,
        code: data.code,
        type: data.type.toUpperCase(),
        subType: data.subType,
        description: data.description,
        parentId,
        isActive: data.isActive ?? true,
        organizationId,
      },
    });
    return 'created';
  }

  private async importEmployee(
    organizationId: string,
    data: ImportRow,
    updateExisting: boolean,
    matchField?: string,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const matchValue = matchField ? data[matchField] : data.email;

    if (matchValue && updateExisting) {
      const existing = await this.prisma.employee.findFirst({
        where: {
          organizationId,
          [matchField || 'email']: matchValue,
          isActive: true,
        },
      });

      if (existing) {
        await this.prisma.employee.update({
          where: { id: existing.id },
          data: {
            name: data.name || existing.name,
            phone: data.phone || existing.phone,
            position: data.position || existing.position,
            jobTitle: data.position || existing.jobTitle,
            baseSalary: data.baseSalary ? new Decimal(data.baseSalary) : existing.baseSalary,
            basicSalary: data.baseSalary ? new Decimal(data.baseSalary) : existing.basicSalary,
            bankAccount: data.bankAccount || existing.bankAccount,
            nationalId: data.nationalId || existing.nationalId,
            department: data.departmentName || existing.department,
          },
        });
        return 'updated';
      }
    }

    // Generate employee number if not provided
    const employeeNumber =
      data.employeeNumber || (await this.generateEmployeeNumber(organizationId));

    await this.prisma.employee.create({
      data: {
        name: data.name,
        email: data.email,
        employeeId: employeeNumber,
        employeeNumber,
        phone: data.phone,
        position: data.position,
        jobTitle: data.position,
        department: data.departmentName,
        dateOfJoining: new Date(data.hireDate || data.dateOfJoining),
        hireDate: new Date(data.hireDate || data.dateOfJoining),
        basicSalary: new Decimal(data.baseSalary || data.basicSalary),
        baseSalary: new Decimal(data.baseSalary || data.basicSalary),
        bankAccount: data.bankAccount,
        nationalId: data.nationalId,
        organizationId,
      },
    });
    return 'created';
  }

  private async importBankTransaction(
    organizationId: string,
    data: ImportRow,
  ): Promise<'created' | 'updated' | 'skipped'> {
    // Bank transactions are always created, not updated
    const amount = parseFloat(String(data.amount));
    const type = amount >= 0 ? 'DEPOSIT' : 'WITHDRAWAL';

    // Get or require bankAccountId
    let bankAccountId = data.bankAccountId;
    if (!bankAccountId && data.bankAccountName) {
      const bankAccount = await this.prisma.bankAccount.findFirst({
        where: { organizationId, name: data.bankAccountName },
      });
      bankAccountId = bankAccount?.id;
    }

    if (!bankAccountId) {
      throw new BadRequestException(
        'Bank account ID or name is required for bank transaction import',
      );
    }

    await this.prisma.bankTransaction.create({
      data: {
        date: new Date(data.date),
        description: data.description,
        amount: new Decimal(Math.abs(amount)),
        type: data.type?.toUpperCase() || type,
        reference: data.reference,
        bankAccountId,
        organizationId,
      },
    });
    return 'created';
  }

  private async importQuote(
    organizationId: string,
    data: ImportRow,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const customer = await this.prisma.customer.findFirst({
      where: { organizationId, email: data.customerEmail, deletedAt: null },
    });
    if (!customer) {
      throw new BadRequestException(`Customer not found with email: ${data.customerEmail}`);
    }

    const item = await this.prisma.item.findFirst({
      where: { organizationId, sku: data.itemSku, deletedAt: null },
    });
    if (!item) {
      throw new BadRequestException(`Item not found with SKU: ${data.itemSku}`);
    }

    const quantity = new Decimal(data.quantity);
    const rate = new Decimal(data.rate);
    const discount = data.discount ? new Decimal(data.discount) : new Decimal(0);
    const taxRate = data.taxRate ? new Decimal(data.taxRate) : new Decimal(0);
    const lineAmount = quantity.mul(rate).sub(discount);
    const taxAmount = lineAmount.mul(taxRate).div(100);
    const grandTotal = lineAmount.add(taxAmount);

    const quoteNumber = await this.generateDocNumber(organizationId, 'EST', 'quote', 'quoteNumber');

    await this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.create({
        data: {
          quoteNumber,
          customerId: customer.id,
          date: data.date ? new Date(data.date) : new Date(),
          expiryDate: data.expiryDate
            ? new Date(data.expiryDate)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'DRAFT',
          subtotal: lineAmount,
          taxAmount,
          discountAmount: discount,
          grandTotal,
          notes: data.notes,
          terms: data.terms,
          organizationId,
        },
      });

      await tx.quoteLine.create({
        data: {
          quoteId: quote.id,
          itemId: item.id,
          description: item.name,
          quantity,
          rate,
          discount,
          taxRate,
          amount: lineAmount,
        },
      });
    });

    return 'created';
  }

  // === Money-bearing imports go through the same domain commands as the UI/API ===
  // (tenant checks, Decimal math, document numbering and, where the command posts, the journal).

  // === Idempotent money-bearing rows ===

  /** Marker written into the created document so a re-run of the same row is recognised. */
  private tag(text: string | undefined, ctx: RowContext): string {
    return [text, ctx.marker].filter(Boolean).join(' ');
  }

  /**
   * Runs one money-bearing row in its own transaction under an advisory lock on the row key: if a
   * document carrying the row's marker already exists in the organization the row is skipped,
   * otherwise the domain command creates it (with the marker) inside the same transaction.
   */
  private async importOnce(
    organizationId: string,
    kind: DocumentKind,
    rowKey: string,
    create: (ctx: RowContext) => Promise<'created' | 'updated' | 'skipped'>,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const marker = `[import ${rowKey}]`;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`import:${organizationId}:${rowKey}`}))`;
      if (await this.markerExists(tx, organizationId, kind, marker)) return 'skipped';
      return create({ tx, marker });
    });
  }

  private async markerExists(
    tx: Prisma.TransactionClient,
    organizationId: string,
    kind: DocumentKind,
    marker: string,
  ): Promise<boolean> {
    const contains = { contains: marker };
    const where = { organizationId };
    switch (kind) {
      case 'invoice':
        return (await tx.invoice.count({ where: { ...where, notes: contains } })) > 0;
      case 'bill':
        return (await tx.bill.count({ where: { ...where, reference: contains } })) > 0;
      case 'expense':
        return (await tx.expense.count({ where: { ...where, reference: contains } })) > 0;
      case 'vendorCredit':
        return (await tx.vendorCredit.count({ where: { ...where, reason: contains } })) > 0;
      case 'creditNote':
        return (await tx.creditNote.count({ where: { ...where, reason: contains } })) > 0;
      case 'paymentMade':
        return (await tx.paymentMade.count({ where: { ...where, reference: contains } })) > 0;
      case 'paymentReceived':
        return (await tx.paymentReceived.count({ where: { ...where, reference: contains } })) > 0;
    }
  }

  private cell(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    const text = String(value).trim();
    return text === '' ? undefined : text;
  }

  /** A required decimal cell as text; the domain command validates scale and range. */
  private decimalCell(value: unknown, field: string): string {
    const text = this.cell(value);
    if (!text) throw new BadRequestException(`${field} is required`);
    if (!/^\d+(\.\d+)?$/.test(text)) {
      throw new BadRequestException(`${field} must be a non-negative decimal number`);
    }
    return text;
  }

  private isoDate(value: unknown, field: string): string {
    const text = this.cell(value);
    const date = text ? new Date(text) : null;
    if (!date || Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return date.toISOString();
  }

  private async accountIdByCode(
    organizationId: string,
    code: unknown,
    label: string,
  ): Promise<string> {
    const text = this.cell(code);
    if (!text) throw new BadRequestException(`${label} is required`);
    const account = await this.prisma.account.findFirst({
      where: { organizationId, code: text, deletedAt: null },
      select: { id: true },
    });
    if (!account) throw new BadRequestException(`Account not found with code: ${text}`);
    return account.id;
  }

  private async customerIdByEmail(organizationId: string, email: unknown): Promise<string> {
    const customer = await this.prisma.customer.findFirst({
      where: { organizationId, email: this.cell(email), deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new BadRequestException(`Customer not found with email: ${email}`);
    return customer.id;
  }

  private async vendorIdByEmail(organizationId: string, email: unknown): Promise<string> {
    const vendor = await this.prisma.vendor.findFirst({
      where: { organizationId, email: this.cell(email), deletedAt: null },
      select: { id: true },
    });
    if (!vendor) throw new BadRequestException(`Vendor not found with email: ${email}`);
    return vendor.id;
  }

  private async invoiceByNumber(
    organizationId: string,
    invoiceNumber: unknown,
  ): Promise<{ id: string; customerId: string }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { organizationId, invoiceNumber: this.cell(invoiceNumber), deletedAt: null },
      select: { id: true, customerId: true },
    });
    if (!invoice) throw new BadRequestException(`Invoice not found with number: ${invoiceNumber}`);
    return invoice;
  }

  private async billByNumber(
    organizationId: string,
    billNumber: unknown,
  ): Promise<{ id: string; vendorId: string }> {
    const bill = await this.prisma.bill.findFirst({
      where: { organizationId, billNumber: this.cell(billNumber), deletedAt: null },
      select: { id: true, vendorId: true },
    });
    if (!bill) throw new BadRequestException(`Bill not found with number: ${billNumber}`);
    return bill;
  }

  private async importCreditNote(
    organizationId: string,
    data: ImportRow,
    ctx: RowContext,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const customerId = await this.customerIdByEmail(organizationId, data.customerEmail);
    const invoice = await this.invoiceByNumber(organizationId, data.invoiceNumber);
    const type = String(data.type).toUpperCase();
    if (type !== 'REFUND' && type !== 'APPLY_TO_INVOICE') {
      throw new BadRequestException('type must be REFUND or APPLY_TO_INVOICE');
    }
    // Posts Dr Sales Returns / VAT, Cr AR (or the refund account) and applies the balance.
    await this.creditNotesService.create(
      organizationId,
      {
        customerId,
        invoiceId: invoice.id,
        date: this.isoDate(data.date, 'date'),
        reason: this.tag(this.cell(data.reason) ?? 'Imported credit note', ctx),
        amount: this.decimalCell(data.amount, 'amount'),
        type: type as CreditNoteType,
        refundAccountId:
          type === 'REFUND'
            ? await this.accountIdByCode(
                organizationId,
                data.refundAccountCode,
                'refundAccountCode',
              )
            : undefined,
      },
      { tx: ctx.tx },
    );
    return 'created';
  }

  private async importPaymentReceived(
    organizationId: string,
    data: ImportRow,
    ctx: RowContext,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const customerId = await this.customerIdByEmail(organizationId, data.customerEmail);
    const depositToAccountId = await this.accountIdByCode(
      organizationId,
      data.depositAccountCode,
      'depositAccountCode',
    );
    if (!this.cell(data.invoiceNumber)) {
      throw new BadRequestException(
        'invoiceNumber is required: a payment must be allocated to an invoice',
      );
    }
    const invoice = await this.invoiceByNumber(organizationId, data.invoiceNumber);
    const amount = this.decimalCell(data.amount, 'amount');
    // Posts Dr bank / Cr AR and reduces the invoice balance.
    await this.paymentsReceivedService.create(
      organizationId,
      {
        customerId,
        date: this.isoDate(data.date, 'date'),
        amount,
        paymentMode: String(data.paymentMode).toUpperCase() as PaymentMode,
        depositToAccountId,
        reference: this.tag(this.cell(data.reference), ctx),
        notes: this.cell(data.notes),
        allocations: [{ invoiceId: invoice.id, amount }],
      },
      { tx: ctx.tx },
    );
    return 'created';
  }

  private async importDeliveryChallan(
    organizationId: string,
    data: ImportRow,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const customer = await this.prisma.customer.findFirst({
      where: { organizationId, email: data.customerEmail, deletedAt: null },
    });
    if (!customer) {
      throw new BadRequestException(`Customer not found with email: ${data.customerEmail}`);
    }

    const item = await this.prisma.item.findFirst({
      where: { organizationId, sku: data.itemSku, deletedAt: null },
    });
    if (!item) {
      throw new BadRequestException(`Item not found with SKU: ${data.itemSku}`);
    }

    let invoiceId: string | undefined;
    if (data.invoiceNumber) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { organizationId, invoiceNumber: data.invoiceNumber, deletedAt: null },
      });
      invoiceId = invoice?.id;
    }

    let warehouseId: string | undefined;
    if (data.warehouseName) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { organizationId, name: data.warehouseName },
      });
      warehouseId = warehouse?.id;
    }

    const challanNumber = await this.generateDocNumber(
      organizationId,
      'DC',
      'deliveryChallan',
      'challanNumber',
    );

    await this.prisma.$transaction(async (tx) => {
      const challan = await tx.deliveryChallan.create({
        data: {
          challanNumber,
          customerId: customer.id,
          invoiceId,
          challanType: String(data.challanType).toUpperCase() as 'SUPPLY' | 'JOB_WORK' | 'SAMPLE',
          date: new Date(data.date),
          status: 'DRAFT',
          notes: data.notes,
          organizationId,
        },
      });

      await tx.deliveryChallanLine.create({
        data: {
          challanId: challan.id,
          itemId: item.id,
          quantity: new Decimal(data.quantity),
          description: item.name,
          warehouseId,
        },
      });
    });

    return 'created';
  }

  private async itemBySku(
    organizationId: string,
    sku: unknown,
  ): Promise<{ id: string; name: string }> {
    const item = await this.prisma.item.findFirst({
      where: { organizationId, sku: this.cell(sku), deletedAt: null },
      select: { id: true, name: true },
    });
    if (!item) throw new BadRequestException(`Item not found with SKU: ${sku}`);
    return item;
  }

  private async importInvoice(
    organizationId: string,
    data: ImportRow,
    ctx: RowContext,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const customerId = await this.customerIdByEmail(organizationId, data.customerEmail);
    const item = await this.itemBySku(organizationId, data.itemSku);
    const date = this.isoDate(data.date, 'date');
    // A DRAFT invoice with server-computed totals; it posts when it is sent.
    await this.invoicesService.create(
      organizationId,
      {
        customerId,
        date,
        dueDate: data.dueDate ? this.isoDate(data.dueDate, 'dueDate') : date,
        notes: this.tag(this.cell(data.notes), ctx),
        lines: [
          {
            itemId: item.id,
            description: item.name,
            quantity: this.decimalCell(data.quantity, 'quantity'),
            rate: this.decimalCell(data.rate, 'rate'),
          },
        ],
      },
      { tx: ctx.tx },
    );
    return 'created';
  }

  private async importBill(
    organizationId: string,
    data: ImportRow,
    ctx: RowContext,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const vendorId = await this.vendorIdByEmail(organizationId, data.vendorEmail);
    const item = await this.itemBySku(organizationId, data.itemSku);
    const date = this.isoDate(data.date, 'date');
    // A DRAFT bill with server-computed totals; it posts when it is approved.
    await this.billsService.create(
      organizationId,
      {
        vendorId,
        date,
        dueDate: data.dueDate ? this.isoDate(data.dueDate, 'dueDate') : date,
        reference: this.tag(this.cell(data.reference), ctx),
        notes: this.cell(data.notes),
        lines: [
          {
            itemId: item.id,
            description: item.name,
            quantity: this.decimalCell(data.quantity, 'quantity'),
            rate: this.decimalCell(data.rate, 'rate'),
          },
        ],
      },
      { tx: ctx.tx },
    );
    return 'created';
  }

  private async importExpense(
    organizationId: string,
    data: ImportRow,
    ctx: RowContext,
  ): Promise<'created' | 'updated' | 'skipped'> {
    if (this.cell(data.taxAmount)) {
      throw new BadRequestException(
        'taxAmount is not accepted: provide taxRate (a percentage) and the VAT is computed',
      );
    }
    const accountId = await this.accountIdByCode(organizationId, data.accountCode, 'accountCode');

    let paidThroughAccountId: string;
    if (this.cell(data.paidThroughAccountCode)) {
      paidThroughAccountId = await this.accountIdByCode(
        organizationId,
        data.paidThroughAccountCode,
        'paidThroughAccountCode',
      );
    } else {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { defaultBankAccountId: true, defaultCashAccountId: true },
      });
      const fallback = org?.defaultBankAccountId ?? org?.defaultCashAccountId;
      if (!fallback) {
        throw new BadRequestException(
          'paidThroughAccountCode is required (or configure a default bank account in organization settings)',
        );
      }
      paidThroughAccountId = fallback;
    }

    const vendorId = this.cell(data.vendorEmail)
      ? await this.vendorIdByEmail(organizationId, data.vendorEmail)
      : undefined;

    // Posts Dr expense / VAT, Cr paid-through account.
    await this.expensesService.create(
      organizationId,
      {
        date: this.isoDate(data.date, 'date'),
        accountId,
        vendorId,
        amount: this.decimalCell(data.amount, 'amount'),
        taxRate: this.cell(data.taxRate) ? this.decimalCell(data.taxRate, 'taxRate') : undefined,
        paidThroughAccountId,
        description: this.cell(data.description),
        reference: this.tag(this.cell(data.reference), ctx),
      },
      { tx: ctx.tx },
    );
    return 'created';
  }

  private async importVendorCredit(
    organizationId: string,
    data: ImportRow,
    ctx: RowContext,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const vendorId = await this.vendorIdByEmail(organizationId, data.vendorEmail);
    const bill = await this.billByNumber(organizationId, data.billNumber);
    // Posts Dr AP / Cr expense (and VAT) against the posted bill.
    await this.vendorCreditsService.create(
      organizationId,
      {
        vendorId,
        billId: bill.id,
        date: data.date ? this.isoDate(data.date, 'date') : undefined,
        reason: this.tag(this.cell(data.reason) ?? 'Imported vendor credit', ctx),
        amount: this.decimalCell(data.amount, 'amount'),
      },
      { tx: ctx.tx },
    );
    return 'created';
  }

  private async importPaymentMade(
    organizationId: string,
    data: ImportRow,
    ctx: RowContext,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const vendorId = await this.vendorIdByEmail(organizationId, data.vendorEmail);
    const paidFromAccountId = await this.accountIdByCode(
      organizationId,
      data.paidFromAccountCode,
      'paidFromAccountCode',
    );
    if (!this.cell(data.billNumber)) {
      throw new BadRequestException(
        'billNumber is required: a payment must be allocated to a bill',
      );
    }
    const bill = await this.billByNumber(organizationId, data.billNumber);
    const amount = this.decimalCell(data.amount, 'amount');
    // Posts Dr AP / Cr bank and reduces the bill balance.
    await this.paymentsMadeService.create(
      organizationId,
      {
        vendorId,
        date: this.isoDate(data.date, 'date'),
        amount,
        paymentMode: String(data.paymentMode).toUpperCase() as PaymentMode,
        paidFromAccountId,
        reference: this.tag(this.cell(data.reference), ctx),
        notes: this.cell(data.notes),
        allocations: [{ billId: bill.id, amount }],
      },
      { tx: ctx.tx },
    );
    return 'created';
  }

  private async generateDocNumber(
    organizationId: string,
    prefix: string,
    model:
      | 'quote'
      | 'creditNote'
      | 'paymentReceived'
      | 'deliveryChallan'
      | 'invoice'
      | 'bill'
      | 'vendorCredit'
      | 'paymentMade',
    numberField: string,
  ): Promise<string> {
    const fieldSelect = { [numberField]: true };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const last = await (this.prisma[model] as any).findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: fieldSelect,
    });

    const lastNum = last?.[numberField] as string | undefined;
    if (!lastNum) {
      return `${prefix}-001`;
    }

    const parts = lastNum.split('-');
    const seq = parseInt(parts[parts.length - 1], 10);
    return `${prefix}-${String(seq + 1).padStart(3, '0')}`;
  }

  // ============ Helper Methods ============

  private mapRow(row: ImportRow, mappings: ColumnMappingDto[]): ImportRow {
    const result: ImportRow = {};

    for (const mapping of mappings) {
      let value = row[mapping.sourceColumn];

      // Apply default if empty
      if ((value === undefined || value === null || value === '') && mapping.defaultValue) {
        value = mapping.defaultValue;
      }

      // Apply transformation
      if (value && mapping.transform) {
        value = this.applyTransform(value, mapping.transform);
      }

      result[mapping.targetField] = value;
    }

    return result;
  }

  private applyTransform(value: unknown, transform: string): unknown {
    switch (transform) {
      case 'uppercase':
        return String(value).toUpperCase();
      case 'lowercase':
        return String(value).toLowerCase();
      case 'trim':
        return String(value).trim();
      case 'parseNumber':
        return Number(value);
      case 'parseDate':
        return new Date(String(value));
      case 'parseBoolean':
        return ['true', '1', 'yes'].includes(String(value).toLowerCase());
      default:
        return value;
    }
  }

  private transformRow(row: ImportRow, _entityType: ImportEntityType): ImportRow {
    const transformed = { ...row };

    // Clean string values
    Object.keys(transformed).forEach((key) => {
      if (typeof transformed[key] === 'string') {
        transformed[key] = transformed[key].trim();
        if (transformed[key] === '') {
          transformed[key] = null;
        }
      }
    });

    return transformed;
  }

  async getAllRows(buffer: Buffer, filename: string): Promise<ImportRow[]> {
    const extension = filename.toLowerCase().split('.').pop();

    if (extension === 'ofx' || extension === 'qfx') {
      return this.getOfxRows(buffer);
    }

    if (extension === 'csv') {
      return new Promise((resolve, reject) => {
        const rows: ImportRow[] = [];
        const stream = Readable.from(buffer.toString());
        stream
          .pipe(csv())
          .on('data', (row) => rows.push(row))
          .on('end', () => resolve(rows))
          .on('error', reject);
      });
    } else {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<ImportRow>(worksheet, {
        header: 1,
      });

      const headers = (data[0] as string[]).map((h) => String(h || '').trim());
      return data.slice(1).map((row: unknown[]) => {
        const obj: ImportRow = {};
        headers.forEach((header, index) => {
          obj[header] = row[index];
        });
        return obj;
      });
    }
  }

  private async generateEmployeeNumber(organizationId: string): Promise<string> {
    const lastEmployee = await this.prisma.employee.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { employeeNumber: true },
    });

    if (!lastEmployee?.employeeNumber) {
      return 'EMP-001';
    }

    const lastNumber = parseInt(lastEmployee.employeeNumber.split('-')[1], 10);
    return `EMP-${String(lastNumber + 1).padStart(3, '0')}`;
  }

  // ============ Get Field Definitions ============

  getFieldDefinitions(entityType: ImportEntityType) {
    return ENTITY_FIELD_DEFINITIONS[entityType] || [];
  }

  getAvailableEntityTypes() {
    return Object.values(ImportEntityType);
  }
}
