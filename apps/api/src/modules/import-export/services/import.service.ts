import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ImportConfigDto,
  ImportEntityType,
  ValidationResultDto,
  ValidationErrorDto,
  ImportResultDto,
  ParseFileResultDto,
  ENTITY_FIELD_DEFINITIONS,
  ColumnMappingDto,
} from '../dto/import-export.dto';
import * as XLSX from 'xlsx';
import * as csv from 'csv-parser';
import { Readable } from 'stream';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ImportService {
  constructor(private prisma: PrismaService) {}

  // ============ File Parsing ============

  async parseFile(
    buffer: Buffer,
    filename: string,
  ): Promise<ParseFileResultDto> {
    const extension = filename.toLowerCase().split('.').pop();

    if (extension === 'csv') {
      return this.parseCsv(buffer);
    } else if (extension === 'xlsx' || extension === 'xls') {
      return this.parseExcel(buffer);
    } else {
      throw new BadRequestException('Unsupported file format. Please use CSV or Excel (.xlsx)');
    }
  }

  private async parseCsv(buffer: Buffer): Promise<ParseFileResultDto> {
    return new Promise((resolve, reject) => {
      const rows: Record<string, any>[] = [];
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

    const data = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { header: 1 });

    if (data.length === 0) {
      throw new BadRequestException('Excel file is empty');
    }

    const headers = (data[0] as string[]).map((h) => String(h || '').trim());
    const rows = data.slice(1).map((row: any[]) => {
      const obj: Record<string, any> = {};
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

  // ============ Validation ============

  async validateImport(
    organizationId: string,
    buffer: Buffer,
    filename: string,
    config: ImportConfigDto,
  ): Promise<ValidationResultDto> {
    const parsed = await this.parseFile(buffer, filename);
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
    value: any,
  ): string | null {
    switch (fieldDef.type) {
      case 'number':
        if (isNaN(Number(value))) {
          return 'Must be a valid number';
        }
        break;
      case 'decimal':
        if (isNaN(parseFloat(value))) {
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
    rows: Record<string, any>[],
    config: ImportConfigDto,
  ): Promise<ValidationErrorDto[]> {
    const warnings: ValidationErrorDto[] = [];

    if (config.matchField) {
      const matchValues = rows.map((row) =>
        this.mapRow(row, config.columnMappings)[config.matchField!],
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
      } catch (error) {
        result.failed++;
        result.errors.push({
          row: i + 2,
          error: error.message,
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
    data: Record<string, any>,
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
      default:
        throw new BadRequestException(`Import for ${entityType} not yet implemented`);
    }
  }

  private async importCustomer(
    organizationId: string,
    data: Record<string, any>,
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
    data: Record<string, any>,
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
    data: Record<string, any>,
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
            purchasePrice: data.purchasePrice ? new Decimal(data.purchasePrice) : existing.purchasePrice,
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
    data: Record<string, any>,
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
    data: Record<string, any>,
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
    const employeeNumber = data.employeeNumber || await this.generateEmployeeNumber(organizationId);

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
    data: Record<string, any>,
  ): Promise<'created' | 'updated' | 'skipped'> {
    // Bank transactions are always created, not updated
    const amount = parseFloat(data.amount);
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
      throw new BadRequestException('Bank account ID or name is required for bank transaction import');
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

  // ============ Helper Methods ============

  private mapRow(
    row: Record<string, any>,
    mappings: ColumnMappingDto[],
  ): Record<string, any> {
    const result: Record<string, any> = {};

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

  private applyTransform(value: any, transform: string): any {
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
        return new Date(value);
      case 'parseBoolean':
        return ['true', '1', 'yes'].includes(String(value).toLowerCase());
      default:
        return value;
    }
  }

  private transformRow(row: Record<string, any>, entityType: ImportEntityType): Record<string, any> {
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

  private async getAllRows(buffer: Buffer, filename: string): Promise<Record<string, any>[]> {
    const extension = filename.toLowerCase().split('.').pop();

    if (extension === 'csv') {
      return new Promise((resolve, reject) => {
        const rows: Record<string, any>[] = [];
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
      const data = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { header: 1 });

      const headers = (data[0] as string[]).map((h) => String(h || '').trim());
      return data.slice(1).map((row: any[]) => {
        const obj: Record<string, any> = {};
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
