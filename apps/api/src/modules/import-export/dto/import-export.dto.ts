import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsDateString,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============ Enums ============

export enum ImportEntityType {
  CUSTOMERS = 'customers',
  VENDORS = 'vendors',
  ITEMS = 'items',
  ACCOUNTS = 'accounts',
  INVOICES = 'invoices',
  BILLS = 'bills',
  EXPENSES = 'expenses',
  JOURNALS = 'journals',
  BANK_TRANSACTIONS = 'bank_transactions',
  EMPLOYEES = 'employees',
  QUOTES = 'quotes',
  CREDIT_NOTES = 'credit_notes',
  PAYMENTS_RECEIVED = 'payments_received',
  DELIVERY_CHALLANS = 'delivery_challans',
  VENDOR_CREDITS = 'vendor_credits',
  PAYMENTS_MADE = 'payments_made',
}

export enum ExportFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
  JSON = 'json',
}

// ============ Column Mapping DTOs ============

export class ColumnMappingDto {
  @ApiProperty({ description: 'Source column name from file' })
  @IsString()
  sourceColumn: string;

  @ApiProperty({ description: 'Target field name in the system' })
  @IsString()
  targetField: string;

  @ApiPropertyOptional({ description: 'Default value if source is empty' })
  @IsOptional()
  defaultValue?: string;

  @ApiPropertyOptional({ description: 'Transformation function to apply' })
  @IsOptional()
  @IsString()
  transform?: 'uppercase' | 'lowercase' | 'trim' | 'parseNumber' | 'parseDate' | 'parseBoolean';
}

// ============ Import DTOs ============

export class ParseFileResultDto {
  @ApiProperty({ description: 'Headers found in the file' })
  headers: string[];

  @ApiProperty({ description: 'Preview of first rows' })
  preview: Record<string, unknown>[];

  @ApiProperty({ description: 'Total row count' })
  totalRows: number;

  @ApiProperty({ description: 'Detected file type' })
  fileType: 'csv' | 'xlsx';
}

export class ImportConfigDto {
  @ApiProperty({ enum: ImportEntityType })
  @IsEnum(ImportEntityType)
  entityType: ImportEntityType;

  @ApiProperty({ type: [ColumnMappingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnMappingDto)
  columnMappings: ColumnMappingDto[];

  @ApiPropertyOptional({ description: 'Skip first N rows' })
  @IsOptional()
  skipRows?: number = 0;

  @ApiPropertyOptional({ description: 'Update existing records if found' })
  @IsOptional()
  @IsBoolean()
  updateExisting?: boolean = false;

  @ApiPropertyOptional({ description: 'Field to use for matching existing records' })
  @IsOptional()
  @IsString()
  matchField?: string;

  @ApiPropertyOptional({ description: 'Stop import on first error' })
  @IsOptional()
  @IsBoolean()
  stopOnError?: boolean = false;
}

export class ValidationErrorDto {
  @ApiProperty()
  row: number;

  @ApiProperty()
  field: string;

  @ApiProperty()
  value: unknown;

  @ApiProperty()
  error: string;
}

export class ValidationResultDto {
  @ApiProperty()
  valid: boolean;

  @ApiProperty()
  totalRows: number;

  @ApiProperty()
  validRows: number;

  @ApiProperty()
  invalidRows: number;

  @ApiProperty({ type: [ValidationErrorDto] })
  errors: ValidationErrorDto[];

  @ApiProperty({ description: "Warnings that won't block import" })
  warnings: ValidationErrorDto[];
}

export class ImportResultDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  totalProcessed: number;

  @ApiProperty()
  created: number;

  @ApiProperty()
  updated: number;

  @ApiProperty()
  skipped: number;

  @ApiProperty()
  failed: number;

  @ApiProperty({ type: [Object] })
  errors: Array<{ row: number; error: string }>;
}

// ============ Export DTOs ============

export class ExportQueryDto {
  @ApiProperty({ enum: ExportFormat, default: ExportFormat.CSV })
  @IsEnum(ExportFormat)
  format: ExportFormat = ExportFormat.CSV;

  @ApiPropertyOptional({ description: 'Start date for filtering' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date for filtering' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Specific fields to export' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fields?: string[];

  @ApiPropertyOptional({ description: 'Include deleted records' })
  @IsOptional()
  @IsBoolean()
  includeDeleted?: boolean = false;
}

// ============ Entity Field Definitions ============

export interface EntityFieldDefinition {
  field: string;
  label: string;
  required: boolean;
  type: 'string' | 'number' | 'decimal' | 'date' | 'boolean' | 'enum';
  enumValues?: string[];
  example?: string;
  description?: string;
}

export const ENTITY_FIELD_DEFINITIONS: Record<ImportEntityType, EntityFieldDefinition[]> = {
  [ImportEntityType.CUSTOMERS]: [
    { field: 'name', label: 'Customer Name', required: true, type: 'string', example: 'ABC Corp' },
    { field: 'email', label: 'Email', required: false, type: 'string', example: 'contact@abc.com' },
    { field: 'phone', label: 'Phone', required: false, type: 'string', example: '+966501234567' },
    { field: 'address', label: 'Address', required: false, type: 'string' },
    { field: 'city', label: 'City', required: false, type: 'string', example: 'Riyadh' },
    {
      field: 'country',
      label: 'Country',
      required: false,
      type: 'string',
      example: 'Saudi Arabia',
    },
    { field: 'taxId', label: 'Tax ID (VAT Number)', required: false, type: 'string' },
    {
      field: 'paymentTerms',
      label: 'Payment Terms (days)',
      required: false,
      type: 'number',
      example: '30',
    },
    {
      field: 'creditLimit',
      label: 'Credit Limit',
      required: false,
      type: 'decimal',
      example: '50000',
    },
  ],
  [ImportEntityType.VENDORS]: [
    {
      field: 'name',
      label: 'Vendor Name',
      required: true,
      type: 'string',
      example: 'XYZ Supplier',
    },
    { field: 'email', label: 'Email', required: false, type: 'string' },
    { field: 'phone', label: 'Phone', required: false, type: 'string' },
    { field: 'address', label: 'Address', required: false, type: 'string' },
    { field: 'city', label: 'City', required: false, type: 'string' },
    { field: 'country', label: 'Country', required: false, type: 'string' },
    { field: 'taxId', label: 'Tax ID (VAT Number)', required: false, type: 'string' },
    {
      field: 'paymentTerms',
      label: 'Payment Terms (days)',
      required: false,
      type: 'number',
      example: '30',
    },
    { field: 'bankName', label: 'Bank Name', required: false, type: 'string' },
    { field: 'bankAccount', label: 'Bank Account', required: false, type: 'string' },
  ],
  [ImportEntityType.ITEMS]: [
    { field: 'name', label: 'Item Name', required: true, type: 'string', example: 'Product A' },
    { field: 'sku', label: 'SKU', required: false, type: 'string', example: 'PRD-001' },
    {
      field: 'type',
      label: 'Type',
      required: true,
      type: 'enum',
      enumValues: ['GOODS', 'SERVICE'],
      example: 'GOODS',
    },
    { field: 'description', label: 'Description', required: false, type: 'string' },
    {
      field: 'salesPrice',
      label: 'Sales Price',
      required: false,
      type: 'decimal',
      example: '100.00',
    },
    {
      field: 'purchasePrice',
      label: 'Purchase Price',
      required: false,
      type: 'decimal',
      example: '80.00',
    },
    { field: 'unit', label: 'Unit', required: false, type: 'string', example: 'pcs' },
    { field: 'taxRate', label: 'Tax Rate (%)', required: false, type: 'number', example: '15' },
    {
      field: 'trackInventory',
      label: 'Track Inventory',
      required: false,
      type: 'boolean',
      example: 'true',
    },
    {
      field: 'reorderLevel',
      label: 'Reorder Level',
      required: false,
      type: 'number',
      example: '10',
    },
  ],
  [ImportEntityType.ACCOUNTS]: [
    {
      field: 'name',
      label: 'Account Name',
      required: true,
      type: 'string',
      example: 'Cash in Hand',
    },
    { field: 'code', label: 'Account Code', required: true, type: 'string', example: '1000' },
    {
      field: 'type',
      label: 'Account Type',
      required: true,
      type: 'enum',
      enumValues: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'],
    },
    { field: 'subType', label: 'Sub Type', required: false, type: 'string' },
    { field: 'description', label: 'Description', required: false, type: 'string' },
    { field: 'parentCode', label: 'Parent Account Code', required: false, type: 'string' },
    {
      field: 'openingBalance',
      label: 'Opening Balance',
      required: false,
      type: 'decimal',
      example: '0',
    },
    { field: 'isActive', label: 'Is Active', required: false, type: 'boolean', example: 'true' },
  ],
  [ImportEntityType.INVOICES]: [
    {
      field: 'customerEmail',
      label: 'Customer Email',
      required: true,
      type: 'string',
      description: 'Used to match customer',
    },
    { field: 'date', label: 'Invoice Date', required: true, type: 'date', example: '2024-01-15' },
    { field: 'dueDate', label: 'Due Date', required: true, type: 'date', example: '2024-02-15' },
    {
      field: 'itemSku',
      label: 'Item SKU',
      required: true,
      type: 'string',
      description: 'One row per line item',
    },
    { field: 'quantity', label: 'Quantity', required: true, type: 'number', example: '1' },
    { field: 'rate', label: 'Rate', required: true, type: 'decimal', example: '100.00' },
    { field: 'notes', label: 'Notes', required: false, type: 'string' },
  ],
  [ImportEntityType.BILLS]: [
    {
      field: 'vendorEmail',
      label: 'Vendor Email',
      required: true,
      type: 'string',
      description: 'Used to match vendor',
    },
    { field: 'date', label: 'Bill Date', required: true, type: 'date', example: '2024-01-15' },
    { field: 'dueDate', label: 'Due Date', required: true, type: 'date', example: '2024-02-15' },
    { field: 'reference', label: 'Reference Number', required: false, type: 'string' },
    { field: 'itemSku', label: 'Item SKU', required: true, type: 'string' },
    { field: 'quantity', label: 'Quantity', required: true, type: 'number' },
    { field: 'rate', label: 'Rate', required: true, type: 'decimal' },
    { field: 'notes', label: 'Notes', required: false, type: 'string' },
  ],
  [ImportEntityType.EXPENSES]: [
    { field: 'date', label: 'Expense Date', required: true, type: 'date', example: '2024-01-15' },
    { field: 'vendorEmail', label: 'Vendor Email', required: false, type: 'string' },
    {
      field: 'accountCode',
      label: 'Expense Account Code',
      required: true,
      type: 'string',
      example: '5000',
    },
    { field: 'amount', label: 'Amount', required: true, type: 'decimal', example: '500.00' },
    { field: 'taxAmount', label: 'Tax Amount', required: false, type: 'decimal', example: '75.00' },
    { field: 'reference', label: 'Reference', required: false, type: 'string' },
    { field: 'description', label: 'Description', required: false, type: 'string' },
  ],
  [ImportEntityType.JOURNALS]: [
    { field: 'date', label: 'Journal Date', required: true, type: 'date', example: '2024-01-15' },
    { field: 'reference', label: 'Reference', required: false, type: 'string' },
    {
      field: 'accountCode',
      label: 'Account Code',
      required: true,
      type: 'string',
      example: '1000',
    },
    { field: 'debit', label: 'Debit Amount', required: true, type: 'decimal', example: '1000.00' },
    { field: 'credit', label: 'Credit Amount', required: true, type: 'decimal', example: '0' },
    { field: 'description', label: 'Line Description', required: false, type: 'string' },
  ],
  [ImportEntityType.BANK_TRANSACTIONS]: [
    {
      field: 'date',
      label: 'Transaction Date',
      required: true,
      type: 'date',
      example: '2024-01-15',
    },
    { field: 'description', label: 'Description', required: true, type: 'string' },
    {
      field: 'amount',
      label: 'Amount',
      required: true,
      type: 'decimal',
      example: '1000.00',
      description: 'Positive for inflow, negative for outflow',
    },
    { field: 'reference', label: 'Reference', required: false, type: 'string' },
    {
      field: 'type',
      label: 'Type',
      required: false,
      type: 'enum',
      enumValues: ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'FEE', 'INTEREST'],
    },
  ],
  [ImportEntityType.EMPLOYEES]: [
    { field: 'name', label: 'Employee Name', required: true, type: 'string', example: 'John Doe' },
    { field: 'email', label: 'Email', required: true, type: 'string', example: 'john@company.com' },
    {
      field: 'employeeNumber',
      label: 'Employee Number',
      required: false,
      type: 'string',
      example: 'EMP-001',
    },
    { field: 'phone', label: 'Phone', required: false, type: 'string' },
    {
      field: 'position',
      label: 'Position',
      required: false,
      type: 'string',
      example: 'Software Engineer',
    },
    { field: 'departmentName', label: 'Department Name', required: false, type: 'string' },
    { field: 'hireDate', label: 'Hire Date', required: true, type: 'date', example: '2024-01-15' },
    {
      field: 'baseSalary',
      label: 'Base Salary',
      required: true,
      type: 'decimal',
      example: '10000',
    },
    { field: 'bankAccount', label: 'Bank Account', required: false, type: 'string' },
    { field: 'nationalId', label: 'National ID', required: false, type: 'string' },
  ],
  [ImportEntityType.QUOTES]: [
    {
      field: 'customerEmail',
      label: 'Customer Email',
      required: true,
      type: 'string',
      description: 'Used to match customer',
    },
    { field: 'date', label: 'Quote Date', required: false, type: 'date', example: '2024-01-15' },
    {
      field: 'expiryDate',
      label: 'Expiry Date',
      required: false,
      type: 'date',
      example: '2024-02-15',
    },
    {
      field: 'itemSku',
      label: 'Item SKU',
      required: true,
      type: 'string',
      description: 'One row per line item',
    },
    { field: 'quantity', label: 'Quantity', required: true, type: 'number', example: '1' },
    { field: 'rate', label: 'Rate', required: true, type: 'decimal', example: '100.00' },
    { field: 'discount', label: 'Discount', required: false, type: 'decimal', example: '0' },
    { field: 'taxRate', label: 'Tax Rate (%)', required: false, type: 'number', example: '15' },
    { field: 'notes', label: 'Notes', required: false, type: 'string' },
    { field: 'terms', label: 'Terms', required: false, type: 'string' },
  ],
  [ImportEntityType.CREDIT_NOTES]: [
    {
      field: 'customerEmail',
      label: 'Customer Email',
      required: true,
      type: 'string',
      description: 'Used to match customer',
    },
    {
      field: 'invoiceNumber',
      label: 'Invoice Number',
      required: true,
      type: 'string',
      example: 'INV-001',
    },
    { field: 'date', label: 'Date', required: true, type: 'date', example: '2024-01-15' },
    { field: 'reason', label: 'Reason', required: false, type: 'string' },
    { field: 'amount', label: 'Amount', required: true, type: 'decimal', example: '500.00' },
    {
      field: 'type',
      label: 'Type',
      required: true,
      type: 'enum',
      enumValues: ['REFUND', 'APPLY_TO_INVOICE'],
    },
  ],
  [ImportEntityType.PAYMENTS_RECEIVED]: [
    {
      field: 'customerEmail',
      label: 'Customer Email',
      required: true,
      type: 'string',
      description: 'Used to match customer',
    },
    { field: 'date', label: 'Payment Date', required: true, type: 'date', example: '2024-01-15' },
    { field: 'amount', label: 'Amount', required: true, type: 'decimal', example: '1000.00' },
    {
      field: 'paymentMode',
      label: 'Payment Mode',
      required: true,
      type: 'enum',
      enumValues: [
        'CASH',
        'BANK_TRANSFER',
        'CREDIT_CARD',
        'DEBIT_CARD',
        'CHEQUE',
        'ONLINE',
        'OTHER',
      ],
    },
    {
      field: 'depositAccountCode',
      label: 'Deposit Account Code',
      required: true,
      type: 'string',
      example: '1000',
    },
    {
      field: 'invoiceNumber',
      label: 'Invoice Number',
      required: false,
      type: 'string',
      description: 'Optional allocation',
    },
    { field: 'reference', label: 'Reference', required: false, type: 'string' },
    { field: 'notes', label: 'Notes', required: false, type: 'string' },
  ],
  [ImportEntityType.DELIVERY_CHALLANS]: [
    {
      field: 'customerEmail',
      label: 'Customer Email',
      required: true,
      type: 'string',
      description: 'Used to match customer',
    },
    { field: 'date', label: 'Challan Date', required: true, type: 'date', example: '2024-01-15' },
    {
      field: 'challanType',
      label: 'Challan Type',
      required: true,
      type: 'enum',
      enumValues: ['SUPPLY', 'JOB_WORK', 'SAMPLE'],
    },
    {
      field: 'invoiceNumber',
      label: 'Invoice Number',
      required: false,
      type: 'string',
      description: 'Optional linked invoice',
    },
    {
      field: 'itemSku',
      label: 'Item SKU',
      required: true,
      type: 'string',
      description: 'One row per line item',
    },
    { field: 'quantity', label: 'Quantity', required: true, type: 'number', example: '1' },
    { field: 'warehouseName', label: 'Warehouse Name', required: false, type: 'string' },
    { field: 'notes', label: 'Notes', required: false, type: 'string' },
  ],
  [ImportEntityType.VENDOR_CREDITS]: [
    {
      field: 'vendorEmail',
      label: 'Vendor Email',
      required: true,
      type: 'string',
      description: 'Used to match vendor',
    },
    {
      field: 'billNumber',
      label: 'Bill Number',
      required: true,
      type: 'string',
      example: 'BILL-001',
    },
    { field: 'date', label: 'Date', required: false, type: 'date', example: '2024-01-15' },
    { field: 'reason', label: 'Reason', required: false, type: 'string' },
    { field: 'amount', label: 'Amount', required: true, type: 'decimal', example: '500.00' },
  ],
  [ImportEntityType.PAYMENTS_MADE]: [
    {
      field: 'vendorEmail',
      label: 'Vendor Email',
      required: true,
      type: 'string',
      description: 'Used to match vendor',
    },
    { field: 'date', label: 'Payment Date', required: true, type: 'date', example: '2024-01-15' },
    { field: 'amount', label: 'Amount', required: true, type: 'decimal', example: '1000.00' },
    {
      field: 'paymentMode',
      label: 'Payment Mode',
      required: true,
      type: 'enum',
      enumValues: [
        'CASH',
        'BANK_TRANSFER',
        'CREDIT_CARD',
        'DEBIT_CARD',
        'CHEQUE',
        'ONLINE',
        'OTHER',
      ],
    },
    {
      field: 'paidFromAccountCode',
      label: 'Paid From Account Code',
      required: true,
      type: 'string',
      example: '1000',
    },
    {
      field: 'billNumber',
      label: 'Bill Number',
      required: false,
      type: 'string',
      description: 'Optional allocation',
    },
    { field: 'reference', label: 'Reference', required: false, type: 'string' },
    { field: 'notes', label: 'Notes', required: false, type: 'string' },
  ],
};
