import { BadRequestException, Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import * as csv from 'csv-parser';
import { Readable } from 'stream';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../../prisma/prisma.service';
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

@Injectable()
export class ImportService {
  constructor(private prisma: PrismaService) {}

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
        return this.importInvoice(organizationId, data);
      case ImportEntityType.QUOTES:
        return this.importQuote(organizationId, data);
      case ImportEntityType.CREDIT_NOTES:
        return this.importCreditNote(organizationId, data);
      case ImportEntityType.PAYMENTS_RECEIVED:
        return this.importPaymentReceived(organizationId, data);
      case ImportEntityType.DELIVERY_CHALLANS:
        return this.importDeliveryChallan(organizationId, data);
      case ImportEntityType.BILLS:
        return this.importBill(organizationId, data);
      case ImportEntityType.EXPENSES:
        return this.importExpense(organizationId, data);
      case ImportEntityType.VENDOR_CREDITS:
        return this.importVendorCredit(organizationId, data);
      case ImportEntityType.PAYMENTS_MADE:
        return this.importPaymentMade(organizationId, data);
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
        openingBalance: data.openingBalance ? new Decimal(data.openingBalance) : undefined,
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

  private async importCreditNote(
    organizationId: string,
    data: ImportRow,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const customer = await this.prisma.customer.findFirst({
      where: { organizationId, email: data.customerEmail, deletedAt: null },
    });
    if (!customer) {
      throw new BadRequestException(`Customer not found with email: ${data.customerEmail}`);
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { organizationId, invoiceNumber: data.invoiceNumber, deletedAt: null },
    });
    if (!invoice) {
      throw new BadRequestException(`Invoice not found with number: ${data.invoiceNumber}`);
    }

    const creditNoteNumber = await this.generateDocNumber(
      organizationId,
      'CN',
      'creditNote',
      'creditNoteNumber',
    );

    await this.prisma.creditNote.create({
      data: {
        creditNoteNumber,
        customerId: customer.id,
        invoiceId: invoice.id,
        date: new Date(data.date),
        reason: data.reason || 'Imported credit note',
        amount: new Decimal(data.amount),
        type: String(data.type).toUpperCase() as 'REFUND' | 'APPLY_TO_INVOICE',
        organizationId,
      },
    });

    return 'created';
  }

  private async importPaymentReceived(
    organizationId: string,
    data: ImportRow,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const customer = await this.prisma.customer.findFirst({
      where: { organizationId, email: data.customerEmail, deletedAt: null },
    });
    if (!customer) {
      throw new BadRequestException(`Customer not found with email: ${data.customerEmail}`);
    }

    const depositAccount = await this.prisma.account.findFirst({
      where: { organizationId, code: data.depositAccountCode },
    });
    if (!depositAccount) {
      throw new BadRequestException(
        `Deposit account not found with code: ${data.depositAccountCode}`,
      );
    }

    const paymentNumber = await this.generateDocNumber(
      organizationId,
      'PMT',
      'paymentReceived',
      'paymentNumber',
    );

    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.paymentReceived.create({
        data: {
          paymentNumber,
          customerId: customer.id,
          date: new Date(data.date),
          amount: new Decimal(data.amount),
          paymentMode: String(data.paymentMode).toUpperCase() as
            | 'CASH'
            | 'BANK_TRANSFER'
            | 'CREDIT_CARD'
            | 'DEBIT_CARD'
            | 'CHEQUE'
            | 'ONLINE'
            | 'OTHER',
          depositToAccountId: depositAccount.id,
          reference: data.reference,
          notes: data.notes,
          organizationId,
        },
      });

      if (data.invoiceNumber) {
        const invoice = await tx.invoice.findFirst({
          where: { organizationId, invoiceNumber: data.invoiceNumber, deletedAt: null },
        });
        if (invoice) {
          await tx.paymentAllocation.create({
            data: {
              paymentId: payment.id,
              invoiceId: invoice.id,
              amount: new Decimal(data.amount),
            },
          });
        }
      }
    });

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

  private async importInvoice(
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
    const lineAmount = quantity.mul(rate);

    const invoiceNumber = await this.generateDocNumber(
      organizationId,
      'INV',
      'invoice',
      'invoiceNumber',
    );

    await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerId: customer.id,
          date: new Date(data.date),
          dueDate: data.dueDate ? new Date(data.dueDate) : new Date(data.date),
          status: 'DRAFT',
          subtotal: lineAmount,
          grandTotal: lineAmount,
          balanceDue: lineAmount,
          notes: data.notes,
          organizationId,
        },
      });

      await tx.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          itemId: item.id,
          description: item.name,
          quantity,
          rate,
          amount: lineAmount,
        },
      });
    });

    return 'created';
  }

  private async importBill(
    organizationId: string,
    data: ImportRow,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const vendor = await this.prisma.vendor.findFirst({
      where: { organizationId, email: data.vendorEmail, deletedAt: null },
    });
    if (!vendor) {
      throw new BadRequestException(`Vendor not found with email: ${data.vendorEmail}`);
    }

    const item = await this.prisma.item.findFirst({
      where: { organizationId, sku: data.itemSku, deletedAt: null },
    });
    if (!item) {
      throw new BadRequestException(`Item not found with SKU: ${data.itemSku}`);
    }

    const quantity = new Decimal(data.quantity);
    const rate = new Decimal(data.rate);
    const lineAmount = quantity.mul(rate);

    const billNumber = await this.generateDocNumber(organizationId, 'BILL', 'bill', 'billNumber');

    await this.prisma.$transaction(async (tx) => {
      const bill = await tx.bill.create({
        data: {
          billNumber,
          vendorId: vendor.id,
          date: new Date(data.date),
          dueDate: data.dueDate ? new Date(data.dueDate) : new Date(data.date),
          status: 'DRAFT',
          subtotal: lineAmount,
          grandTotal: lineAmount,
          balanceDue: lineAmount,
          reference: data.reference,
          notes: data.notes,
          organizationId,
        },
      });

      await tx.billLine.create({
        data: {
          billId: bill.id,
          itemId: item.id,
          description: item.name,
          quantity,
          rate,
          amount: lineAmount,
        },
      });
    });

    return 'created';
  }

  private async importExpense(
    organizationId: string,
    data: ImportRow,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const account = await this.prisma.account.findFirst({
      where: { organizationId, code: data.accountCode },
    });
    if (!account) {
      throw new BadRequestException(`Account not found with code: ${data.accountCode}`);
    }

    // Find a default paid-through account (cash or first bank account)
    const paidThroughAccount = await this.prisma.account.findFirst({
      where: { organizationId, type: 'ASSET', code: { startsWith: '1' } },
      orderBy: { code: 'asc' },
    });
    if (!paidThroughAccount) {
      throw new BadRequestException('No asset account found to use as paid-through account');
    }

    let vendorId: string | undefined;
    if (data.vendorEmail) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { organizationId, email: data.vendorEmail, deletedAt: null },
      });
      vendorId = vendor?.id;
    }

    await this.prisma.expense.create({
      data: {
        date: new Date(data.date),
        accountId: account.id,
        vendorId,
        amount: new Decimal(data.amount),
        taxAmount: data.taxAmount ? new Decimal(data.taxAmount) : new Decimal(0),
        paidThroughAccountId: paidThroughAccount.id,
        description: data.description,
        reference: data.reference,
        organizationId,
      },
    });

    return 'created';
  }

  private async importVendorCredit(
    organizationId: string,
    data: ImportRow,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const vendor = await this.prisma.vendor.findFirst({
      where: { organizationId, email: data.vendorEmail, deletedAt: null },
    });
    if (!vendor) {
      throw new BadRequestException(`Vendor not found with email: ${data.vendorEmail}`);
    }

    const bill = await this.prisma.bill.findFirst({
      where: { organizationId, billNumber: data.billNumber, deletedAt: null },
    });
    if (!bill) {
      throw new BadRequestException(`Bill not found with number: ${data.billNumber}`);
    }

    const creditNumber = await this.generateDocNumber(
      organizationId,
      'VC',
      'vendorCredit',
      'creditNumber',
    );

    await this.prisma.vendorCredit.create({
      data: {
        creditNumber,
        vendorId: vendor.id,
        billId: bill.id,
        date: data.date ? new Date(data.date) : new Date(),
        reason: data.reason || 'Imported vendor credit',
        amount: new Decimal(data.amount),
        organizationId,
      },
    });

    return 'created';
  }

  private async importPaymentMade(
    organizationId: string,
    data: ImportRow,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const vendor = await this.prisma.vendor.findFirst({
      where: { organizationId, email: data.vendorEmail, deletedAt: null },
    });
    if (!vendor) {
      throw new BadRequestException(`Vendor not found with email: ${data.vendorEmail}`);
    }

    const paidFromAccount = await this.prisma.account.findFirst({
      where: { organizationId, code: data.paidFromAccountCode },
    });
    if (!paidFromAccount) {
      throw new BadRequestException(`Account not found with code: ${data.paidFromAccountCode}`);
    }

    const paymentNumber = await this.generateDocNumber(
      organizationId,
      'VPMT',
      'paymentMade',
      'paymentNumber',
    );

    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.paymentMade.create({
        data: {
          paymentNumber,
          vendorId: vendor.id,
          date: new Date(data.date),
          amount: new Decimal(data.amount),
          paymentMode: String(data.paymentMode).toUpperCase() as
            | 'CASH'
            | 'BANK_TRANSFER'
            | 'CREDIT_CARD'
            | 'DEBIT_CARD'
            | 'CHEQUE'
            | 'ONLINE'
            | 'OTHER',
          paidFromAccountId: paidFromAccount.id,
          reference: data.reference,
          notes: data.notes,
          organizationId,
        },
      });

      if (data.billNumber) {
        const bill = await tx.bill.findFirst({
          where: { organizationId, billNumber: data.billNumber, deletedAt: null },
        });
        if (bill) {
          await tx.billAllocation.create({
            data: {
              paymentId: payment.id,
              billId: bill.id,
              amount: new Decimal(data.amount),
            },
          });
        }
      }
    });

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
