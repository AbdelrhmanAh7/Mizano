'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type {
  ColumnMapping,
  FieldDefinition,
  ValidationError,
} from '@/lib/hooks/use-import-export';

// ============ Types ============

interface ImportPreviewTableProps {
  data: Record<string, unknown>[];
  mappings: ColumnMapping[];
  fieldDefinitions: FieldDefinition[];
  validationErrors?: ValidationError[];
}

// ============ Constants ============

const PREVIEW_ROW_LIMIT = 5;

// ============ Component ============

export function ImportPreviewTable({
  data,
  mappings,
  fieldDefinitions,
  validationErrors = [],
}: ImportPreviewTableProps): React.JSX.Element {
  // Build a lookup for active mappings (those with a valid target field)
  const activeMappings = React.useMemo(() => mappings.filter((m) => m.targetField), [mappings]);

  // Build field definition lookup by name
  const fieldDefMap = React.useMemo(() => {
    const map = new Map<string, FieldDefinition>();
    for (const def of fieldDefinitions) {
      map.set(def.name, def);
    }
    return map;
  }, [fieldDefinitions]);

  // Build error lookup: Map<"row:field", error message>
  const errorMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const err of validationErrors) {
      map.set(`${err.row}:${err.field}`, err.error);
    }
    return map;
  }, [validationErrors]);

  // Compute per-row error status
  const rowErrorCounts = React.useMemo(() => {
    const counts = new Map<number, number>();
    for (const err of validationErrors) {
      counts.set(err.row, (counts.get(err.row) ?? 0) + 1);
    }
    return counts;
  }, [validationErrors]);

  // Count valid vs invalid rows
  const previewRows = data.slice(0, PREVIEW_ROW_LIMIT);
  const totalRows = data.length;
  const invalidRowCount = rowErrorCounts.size;
  const validRowCount = totalRows - invalidRowCount;

  const getCellError = React.useCallback(
    (rowIndex: number, fieldName: string): string | undefined => {
      return errorMap.get(`${rowIndex}:${fieldName}`);
    },
    [errorMap],
  );

  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  if (activeMappings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No columns are mapped. Go back and map at least one column to preview data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4 rounded-md border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-medium">{validRowCount} valid</span>
        </div>
        {invalidRowCount > 0 && (
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">
              {invalidRowCount} with errors
            </span>
          </div>
        )}
        <span className="text-xs text-muted-foreground">
          (showing {previewRows.length} of {totalRows} rows)
        </span>
      </div>

      {/* Preview table */}
      <div className="rounded-md border">
        <TooltipProvider delayDuration={200}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                {activeMappings.map((mapping) => {
                  const fieldDef = fieldDefMap.get(mapping.targetField);
                  return (
                    <TableHead key={mapping.targetField}>
                      <div className="flex items-center gap-1">
                        <span>{fieldDef?.label ?? mapping.targetField}</span>
                        {fieldDef?.required && (
                          <span className="text-destructive" aria-label="required">
                            *
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-normal text-muted-foreground">
                        {mapping.sourceColumn}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={activeMappings.length + 1}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No data to preview
                  </TableCell>
                </TableRow>
              ) : (
                previewRows.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {rowIndex + 1}
                    </TableCell>
                    {activeMappings.map((mapping) => {
                      const cellValue = row[mapping.sourceColumn];
                      const cellError = getCellError(rowIndex, mapping.targetField);

                      return (
                        <TableCell
                          key={mapping.targetField}
                          className={cn(cellError && 'bg-destructive/10')}
                        >
                          {cellError ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help text-sm text-destructive underline decoration-dashed">
                                  {formatCellValue(cellValue) || '(empty)'}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                <p className="text-xs">{cellError}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-sm">
                              {formatCellValue(cellValue) || (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>

      {/* Error details */}
      {validationErrors.length > 0 && validationErrors.length <= 20 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="mb-2 text-sm font-medium text-destructive">
            Validation Errors ({validationErrors.length})
          </p>
          <ul className="space-y-1">
            {validationErrors.map((err, i) => (
              <li key={i} className="text-xs text-destructive/80">
                Row {err.row + 1}, {err.field}: {err.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {validationErrors.length > 20 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">
            {validationErrors.length} validation errors found.
          </p>
          <p className="mt-1 text-xs text-destructive/80">
            Showing first 20 errors. Fix the most common issues and re-upload.
          </p>
          <ul className="mt-2 space-y-1">
            {validationErrors.slice(0, 20).map((err, i) => (
              <li key={i} className="text-xs text-destructive/80">
                Row {err.row + 1}, {err.field}: {err.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
