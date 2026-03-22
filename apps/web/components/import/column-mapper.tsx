'use client';

import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ColumnMapping, FieldDefinition } from '@/lib/hooks/use-import-export';

// ============ Types ============

interface ColumnMapperProps {
  headers: string[];
  fieldDefinitions: FieldDefinition[];
  mappings: ColumnMapping[];
  onMappingsChange: (mappings: ColumnMapping[]) => void;
}

// ============ Constants ============

const SKIP_VALUE = '__skip__';

// ============ Component ============

export function ColumnMapper({
  headers,
  fieldDefinitions,
  mappings,
  onMappingsChange,
}: ColumnMapperProps): React.JSX.Element {
  const mappedTargetFields = React.useMemo(() => {
    const mapped = new Set<string>();
    for (const mapping of mappings) {
      if (mapping.targetField && mapping.targetField !== SKIP_VALUE) {
        mapped.add(mapping.targetField);
      }
    }
    return mapped;
  }, [mappings]);

  const requiredFields = React.useMemo(
    () => fieldDefinitions.filter((f) => f.required),
    [fieldDefinitions],
  );

  const unmappedRequired = React.useMemo(
    () => requiredFields.filter((f) => !mappedTargetFields.has(f.name)),
    [requiredFields, mappedTargetFields],
  );

  const handleMappingChange = React.useCallback(
    (sourceColumn: string, targetField: string) => {
      const updatedMappings = [...mappings];
      const existingIndex = updatedMappings.findIndex((m) => m.sourceColumn === sourceColumn);

      if (targetField === SKIP_VALUE) {
        // Remove mapping if skipping
        if (existingIndex >= 0) {
          updatedMappings.splice(existingIndex, 1);
        }
      } else if (existingIndex >= 0) {
        updatedMappings[existingIndex] = { ...updatedMappings[existingIndex], targetField };
      } else {
        const fieldDef = fieldDefinitions.find((f) => f.name === targetField);
        updatedMappings.push({
          sourceColumn,
          targetField,
          transform: getDefaultTransform(fieldDef?.type),
        });
      }

      onMappingsChange(updatedMappings);
    },
    [mappings, onMappingsChange, fieldDefinitions],
  );

  const getMappedField = React.useCallback(
    (sourceColumn: string): string => {
      const mapping = mappings.find((m) => m.sourceColumn === sourceColumn);
      return mapping?.targetField ?? SKIP_VALUE;
    },
    [mappings],
  );

  return (
    <div className="space-y-4">
      {/* Unmapped required fields warning */}
      {unmappedRequired.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Required fields not yet mapped:
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {unmappedRequired.map((field) => (
              <Badge key={field.name} variant="outline" className="text-xs">
                {field.label}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Column mapping rows */}
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <span>Source Column</span>
          <span />
          <span>Target Field</span>
        </div>

        {headers.map((header) => {
          const currentMapping = getMappedField(header);
          const currentFieldDef = fieldDefinitions.find((f) => f.name === currentMapping);

          return (
            <div
              key={header}
              className={cn(
                'grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border p-3',
                currentMapping !== SKIP_VALUE
                  ? 'border-border bg-background'
                  : 'border-dashed border-muted-foreground/25 bg-muted/20',
              )}
            >
              {/* Source column */}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{header}</p>
              </div>

              {/* Arrow */}
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />

              {/* Target field selector */}
              <Select
                value={currentMapping}
                onValueChange={(value) => handleMappingChange(header, value)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select target field" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SKIP_VALUE}>
                    <span className="text-muted-foreground">-- Skip this column --</span>
                  </SelectItem>
                  {fieldDefinitions.map((field) => {
                    const isMappedElsewhere =
                      mappedTargetFields.has(field.name) && currentMapping !== field.name;

                    return (
                      <SelectItem key={field.name} value={field.name} disabled={isMappedElsewhere}>
                        <span className="flex items-center gap-1.5">
                          {field.label}
                          {field.required && (
                            <span className="text-destructive" aria-label="required">
                              *
                            </span>
                          )}
                          {isMappedElsewhere && (
                            <span className="text-xs text-muted-foreground">(mapped)</span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {/* Field description tooltip */}
              {currentFieldDef?.description && (
                <div className="col-span-3 pl-1">
                  <p className="text-xs text-muted-foreground">{currentFieldDef.description}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ Helpers ============

function getDefaultTransform(fieldType: string | undefined): ColumnMapping['transform'] {
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
