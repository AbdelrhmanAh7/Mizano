import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export type ImportEntityType =
  | 'customers'
  | 'vendors'
  | 'items'
  | 'accounts'
  | 'invoices'
  | 'bills'
  | 'expenses'
  | 'journals'
  | 'bank_transactions'
  | 'employees'
  | 'quotes'
  | 'credit_notes'
  | 'payments_received'
  | 'delivery_challans'
  | 'vendor_credits'
  | 'payments_made';

export type ExportFormat = 'csv' | 'xlsx' | 'json';

export interface FieldDefinition {
  name: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'email' | 'phone' | 'currency' | 'enum';
  required: boolean;
  description?: string;
  enumValues?: string[];
  example?: string;
}

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  transform?: 'none' | 'uppercase' | 'lowercase' | 'trim' | 'date' | 'number' | 'currency';
}

export interface ParseFileResult {
  headers: string[];
  sampleRows: Record<string, unknown>[];
  totalRows: number;
  suggestedMappings: ColumnMapping[];
}

export interface ValidationError {
  row: number;
  field: string;
  value: unknown;
  error: string;
}

export interface ValidationResult {
  isValid: boolean;
  validRowCount: number;
  invalidRowCount: number;
  errors: ValidationError[];
  warnings: string[];
}

export interface ImportResult {
  success: boolean;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errors: ValidationError[];
  createdIds: string[];
}

export interface ImportConfig {
  entityType: ImportEntityType;
  columnMappings: ColumnMapping[];
  skipFirstRow?: boolean;
  updateExisting?: boolean;
  duplicateHandling?: 'skip' | 'update' | 'error';
}

export interface ExportOptions {
  format?: ExportFormat;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  includeRelated?: boolean;
}

// ============ API Functions ============

const importExportApi = {
  // Import
  getFieldDefinitions: async (entityType: ImportEntityType) => {
    const response = await api.get(`/import/fields/${entityType}`);
    return response.data;
  },
  parseFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/import/parse', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  validateImport: async (file: File, config: ImportConfig) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('config', JSON.stringify(config));
    const response = await api.post('/import/validate', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  importData: async (file: File, config: ImportConfig) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('config', JSON.stringify(config));
    const response = await api.post('/import/execute', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Export
  exportData: async (entityType: ImportEntityType, options?: ExportOptions) => {
    const response = await api.get(`/export/${entityType}`, {
      params: options,
      responseType: 'blob',
    });
    return response.data;
  },
  getExportTemplate: async (entityType: ImportEntityType, format: ExportFormat = 'csv') => {
    const response = await api.get(`/export/template/${entityType}`, {
      params: { format },
      responseType: 'blob',
    });
    return response.data;
  },

  // Import History
  getImportHistory: async (params?: {
    entityType?: ImportEntityType;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/import/history', { params });
    return response.data;
  },
};

// ============ Hooks - Import ============

export function useFieldDefinitions(entityType: ImportEntityType) {
  return useQuery({
    queryKey: ['import-field-definitions', entityType],
    queryFn: () => importExportApi.getFieldDefinitions(entityType),
    enabled: !!entityType,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

export function useParseFile() {
  return useMutation({
    mutationFn: importExportApi.parseFile,
  });
}

export function useValidateImport() {
  return useMutation({
    mutationFn: ({ file, config }: { file: File; config: ImportConfig }) =>
      importExportApi.validateImport(file, config),
  });
}

export function useImportData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, config }: { file: File; config: ImportConfig }) =>
      importExportApi.importData(file, config),
    onSuccess: (_, { config }) => {
      // Invalidate the relevant queries based on entity type
      queryClient.invalidateQueries({ queryKey: [config.entityType] });
      queryClient.invalidateQueries({ queryKey: ['import-history'] });
    },
  });
}

// ============ Hooks - Export ============

export function useExportData() {
  return useMutation({
    mutationFn: ({
      entityType,
      options,
    }: {
      entityType: ImportEntityType;
      options?: ExportOptions;
    }) => importExportApi.exportData(entityType, options),
  });
}

export function useExportTemplate() {
  return useMutation({
    mutationFn: ({ entityType, format }: { entityType: ImportEntityType; format?: ExportFormat }) =>
      importExportApi.getExportTemplate(entityType, format),
  });
}

// ============ Hooks - History ============

export function useImportHistory(params?: {
  entityType?: ImportEntityType;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['import-history', params],
    queryFn: () => importExportApi.getImportHistory(params),
  });
}

// ============ Helper Functions ============

export function getEntityTypeLabel(type: ImportEntityType): string {
  const labels: Record<ImportEntityType, string> = {
    customers: 'Customers',
    vendors: 'Vendors',
    items: 'Items',
    accounts: 'Chart of Accounts',
    invoices: 'Invoices',
    bills: 'Bills',
    expenses: 'Expenses',
    journals: 'Journal Entries',
    bank_transactions: 'Bank Transactions',
    employees: 'Employees',
    quotes: 'Quotes',
    credit_notes: 'Credit Notes',
    payments_received: 'Payments Received',
    delivery_challans: 'Delivery Challans',
    vendor_credits: 'Vendor Credits',
    payments_made: 'Payments Made',
  };
  return labels[type] || type;
}

export function getEntityTypeIcon(type: ImportEntityType): string {
  const icons: Record<ImportEntityType, string> = {
    customers: '👥',
    vendors: '🏢',
    items: '📦',
    accounts: '📒',
    invoices: '📄',
    bills: '🧾',
    expenses: '💳',
    journals: '📔',
    bank_transactions: '🏦',
    employees: '👤',
    quotes: '📝',
    credit_notes: '📋',
    payments_received: '💰',
    delivery_challans: '🚚',
    vendor_credits: '🏷️',
    payments_made: '💸',
  };
  return icons[type] || '📋';
}

export function getFormatLabel(format: ExportFormat): string {
  const labels: Record<ExportFormat, string> = {
    csv: 'CSV (.csv)',
    xlsx: 'Excel (.xlsx)',
    json: 'JSON (.json)',
  };
  return labels[format] || format;
}

export function getFormatMimeType(format: ExportFormat): string {
  const mimeTypes: Record<ExportFormat, string> = {
    csv: 'text/csv',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    json: 'application/json',
  };
  return mimeTypes[format] || 'application/octet-stream';
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function generateSuggestedMappings(
  headers: string[],
  fieldDefinitions: FieldDefinition[],
): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];

  for (const header of headers) {
    const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Try to find a matching field
    const matchingField = fieldDefinitions.find((field) => {
      const normalizedFieldName = field.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normalizedFieldLabel = field.label.toLowerCase().replace(/[^a-z0-9]/g, '');

      return (
        normalizedHeader === normalizedFieldName ||
        normalizedHeader === normalizedFieldLabel ||
        normalizedHeader.includes(normalizedFieldName) ||
        normalizedFieldName.includes(normalizedHeader)
      );
    });

    if (matchingField) {
      mappings.push({
        sourceColumn: header,
        targetField: matchingField.name,
        transform: getDefaultTransform(matchingField.type),
      });
    }
  }

  return mappings;
}

function getDefaultTransform(fieldType: string): ColumnMapping['transform'] {
  switch (fieldType) {
    case 'date':
      return 'date';
    case 'number':
    case 'currency':
      return 'number';
    default:
      return 'trim';
  }
}

export function validateRow(
  row: Record<string, unknown>,
  mappings: ColumnMapping[],
  fieldDefinitions: FieldDefinition[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const field of fieldDefinitions) {
    const mapping = mappings.find((m) => m.targetField === field.name);
    if (!mapping) {
      if (field.required) {
        errors.push({
          row: 0,
          field: field.name,
          value: undefined,
          error: `Required field "${field.label}" is not mapped`,
        });
      }
      continue;
    }

    const value = row[mapping.sourceColumn] as string | undefined | null;

    // Check required
    if (field.required && (value === undefined || value === null || value === '')) {
      errors.push({
        row: 0,
        field: field.name,
        value,
        error: `${field.label} is required`,
      });
      continue;
    }

    // Skip validation if empty and not required
    if (value === undefined || value === null || value === '') {
      continue;
    }

    // Type validation
    switch (field.type) {
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push({
            row: 0,
            field: field.name,
            value,
            error: `${field.label} must be a valid email address`,
          });
        }
        break;
      case 'number':
      case 'currency':
        if (isNaN(parseFloat(value))) {
          errors.push({
            row: 0,
            field: field.name,
            value,
            error: `${field.label} must be a valid number`,
          });
        }
        break;
      case 'date':
        if (isNaN(Date.parse(value))) {
          errors.push({
            row: 0,
            field: field.name,
            value,
            error: `${field.label} must be a valid date`,
          });
        }
        break;
      case 'enum':
        if (field.enumValues && !field.enumValues.includes(value)) {
          errors.push({
            row: 0,
            field: field.name,
            value,
            error: `${field.label} must be one of: ${field.enumValues.join(', ')}`,
          });
        }
        break;
    }
  }

  return errors;
}
