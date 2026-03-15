'use client';

import * as React from 'react';
import {
  CheckCircle2,
  Download,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { FileDropZone } from './file-drop-zone';
import { ColumnMapper } from './column-mapper';
import { ImportPreviewTable } from './import-preview-table';
import {
  useFieldDefinitions,
  useParseFile,
  useValidateImport,
  useImportData,
  useExportTemplate,
  generateSuggestedMappings,
  downloadBlob,
} from '@/lib/hooks/use-import-export';
import type {
  ImportEntityType,
  ColumnMapping,
  FieldDefinition,
  ImportConfig,
  ParseFileResult,
  ValidationResult,
  ImportResult,
  ExportFormat,
} from '@/lib/hooks/use-import-export';

// ============ Types ============

interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: ImportEntityType;
  entityLabel: string;
  onComplete?: () => void;
}

type WizardStep = 'upload' | 'map' | 'preview' | 'import';

interface WizardState {
  step: WizardStep;
  file: File | null;
  parseResult: ParseFileResult | null;
  mappings: ColumnMapping[];
  validationResult: ValidationResult | null;
  importResult: ImportResult | null;
  skipFirstRow: boolean;
  updateExisting: boolean;
  duplicateHandling: ImportConfig['duplicateHandling'];
}

// ============ Constants ============

const STEPS: WizardStep[] = ['upload', 'map', 'preview', 'import'];

const STEP_LABELS: Record<WizardStep, string> = {
  upload: 'Upload File',
  map: 'Map Columns',
  preview: 'Preview & Validate',
  import: 'Import',
};

const INITIAL_STATE: WizardState = {
  step: 'upload',
  file: null,
  parseResult: null,
  mappings: [],
  validationResult: null,
  importResult: null,
  skipFirstRow: true,
  updateExisting: false,
  duplicateHandling: 'skip',
};

// ============ Component ============

export function ImportWizard({
  open,
  onOpenChange,
  entityType,
  entityLabel,
  onComplete,
}: ImportWizardProps): React.JSX.Element {
  const { toast } = useToast();

  // State
  const [state, setState] = React.useState<WizardState>(INITIAL_STATE);

  // Queries & mutations
  const { data: fieldDefinitions = [] } = useFieldDefinitions(entityType) as {
    data: FieldDefinition[];
  };
  const parseFile = useParseFile();
  const validateImport = useValidateImport();
  const importData = useImportData();
  const exportTemplate = useExportTemplate();

  // Reset state when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      setState(INITIAL_STATE);
      parseFile.reset();
      validateImport.reset();
      importData.reset();
    }
    // Only run when open changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Derived state
  const currentStepIndex = STEPS.indexOf(state.step);
  const isFirstStep = currentStepIndex === 0;
  const isImportComplete = state.step === 'import' && state.importResult !== null;

  const canProceed = React.useMemo((): boolean => {
    switch (state.step) {
      case 'upload':
        return state.file !== null && state.parseResult !== null;
      case 'map':
        return state.mappings.length > 0;
      case 'preview':
        return (
          state.validationResult !== null &&
          (state.validationResult.isValid || state.validationResult.validRowCount > 0)
        );
      case 'import':
        return false;
      default:
        return false;
    }
  }, [state.step, state.file, state.parseResult, state.mappings, state.validationResult]);

  // Build import config from current state
  const buildConfig = React.useCallback((): ImportConfig => {
    return {
      entityType,
      columnMappings: state.mappings,
      skipFirstRow: state.skipFirstRow,
      updateExisting: state.updateExisting,
      duplicateHandling: state.duplicateHandling,
    };
  }, [
    entityType,
    state.mappings,
    state.skipFirstRow,
    state.updateExisting,
    state.duplicateHandling,
  ]);

  // ============ Handlers ============

  const handleFileSelect = React.useCallback(
    (file: File) => {
      setState((prev) => ({
        ...prev,
        file,
        parseResult: null,
        mappings: [],
        validationResult: null,
        importResult: null,
      }));

      parseFile.mutate(file, {
        onSuccess: (result: ParseFileResult) => {
          const suggestedMappings = generateSuggestedMappings(result.headers, fieldDefinitions);
          setState((prev) => ({
            ...prev,
            parseResult: result,
            mappings: suggestedMappings.length > 0 ? suggestedMappings : result.suggestedMappings,
          }));
        },
        onError: () => {
          toast({
            title: 'Parse Error',
            description: 'Failed to parse the file. Please check the format and try again.',
            variant: 'destructive',
          });
        },
      });
    },
    [parseFile, fieldDefinitions, toast],
  );

  const handleDownloadTemplate = React.useCallback(() => {
    exportTemplate.mutate(
      { entityType, format: 'csv' as ExportFormat },
      {
        onSuccess: (blob: Blob) => {
          downloadBlob(blob, `${entityType}-import-template.csv`);
        },
        onError: () => {
          toast({
            title: 'Download Error',
            description: 'Failed to download the template.',
            variant: 'destructive',
          });
        },
      },
    );
  }, [exportTemplate, entityType, toast]);

  const handleMappingsChange = React.useCallback((mappings: ColumnMapping[]) => {
    setState((prev) => ({
      ...prev,
      mappings,
      validationResult: null,
      importResult: null,
    }));
  }, []);

  const handleNext = React.useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= STEPS.length) return;

    const nextStep = STEPS[nextIndex];

    // Trigger validation when entering preview step
    if (nextStep === 'preview' && state.file) {
      const config = buildConfig();
      validateImport.mutate(
        { file: state.file, config },
        {
          onSuccess: (result: ValidationResult) => {
            setState((prev) => ({ ...prev, step: nextStep, validationResult: result }));
          },
          onError: () => {
            toast({
              title: 'Validation Error',
              description: 'Failed to validate the import data.',
              variant: 'destructive',
            });
          },
        },
      );
      return;
    }

    // Trigger import when entering import step
    if (nextStep === 'import' && state.file) {
      const config = buildConfig();
      setState((prev) => ({ ...prev, step: nextStep }));
      importData.mutate(
        { file: state.file, config },
        {
          onSuccess: (result: ImportResult) => {
            setState((prev) => ({ ...prev, importResult: result }));
            if (result.success) {
              toast({
                title: 'Import Complete',
                description: `Successfully imported ${result.importedRows} ${entityLabel.toLowerCase()}.`,
              });
            }
          },
          onError: () => {
            toast({
              title: 'Import Error',
              description: 'Failed to import data. Please try again.',
              variant: 'destructive',
            });
          },
        },
      );
      return;
    }

    setState((prev) => ({ ...prev, step: nextStep }));
  }, [currentStepIndex, state.file, buildConfig, validateImport, importData, entityLabel, toast]);

  const handleBack = React.useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex < 0) return;
    setState((prev) => ({ ...prev, step: STEPS[prevIndex] }));
  }, [currentStepIndex]);

  const handleClose = React.useCallback(() => {
    if (isImportComplete) {
      onComplete?.();
    }
    onOpenChange(false);
  }, [isImportComplete, onComplete, onOpenChange]);

  // ============ Step content renderers ============

  const renderStepIndicator = (): React.JSX.Element => {
    return (
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((step, index) => {
          const isActive = index === currentStepIndex;
          const isCompleted = index < currentStepIndex;

          return (
            <React.Fragment key={step}>
              {index > 0 && (
                <div className={`h-px w-8 ${isCompleted ? 'bg-primary' : 'bg-border'}`} />
              )}
              <div className="flex items-center gap-1.5">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isCompleted
                      ? 'bg-primary text-primary-foreground'
                      : isActive
                        ? 'border-2 border-primary text-primary'
                        : 'border border-border text-muted-foreground'
                  }`}
                >
                  {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </div>
                <span
                  className={`hidden text-xs sm:inline ${
                    isActive ? 'font-medium text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {STEP_LABELS[step]}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const renderUploadStep = (): React.JSX.Element => {
    return (
      <div className="space-y-4">
        <FileDropZone onFileSelect={handleFileSelect} />

        {parseFile.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Parsing file...
          </div>
        )}

        {state.parseResult && (
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-sm">
              Found <strong>{state.parseResult.totalRows}</strong> rows with{' '}
              <strong>{state.parseResult.headers.length}</strong> columns
            </p>
          </div>
        )}

        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            disabled={exportTemplate.isPending}
          >
            {exportTemplate.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download Template
          </Button>
        </div>

        {/* Import options */}
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm font-medium">Import Options</p>
          <div className="flex items-center gap-2">
            <Checkbox
              id="skipFirstRow"
              checked={state.skipFirstRow}
              onCheckedChange={(checked) =>
                setState((prev) => ({ ...prev, skipFirstRow: checked === true }))
              }
            />
            <Label htmlFor="skipFirstRow" className="text-sm">
              First row contains headers
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="updateExisting"
              checked={state.updateExisting}
              onCheckedChange={(checked) =>
                setState((prev) => ({ ...prev, updateExisting: checked === true }))
              }
            />
            <Label htmlFor="updateExisting" className="text-sm">
              Update existing records if duplicates found
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="duplicateHandling" className="shrink-0 text-sm">
              Duplicate handling:
            </Label>
            <Select
              value={state.duplicateHandling}
              onValueChange={(value: ImportConfig['duplicateHandling']) =>
                setState((prev) => ({ ...prev, duplicateHandling: value }))
              }
            >
              <SelectTrigger id="duplicateHandling" className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skip">Skip</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    );
  };

  const renderMapStep = (): React.JSX.Element => {
    if (!state.parseResult) {
      return (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No file data available. Please go back and upload a file.
        </div>
      );
    }

    return (
      <div className="max-h-[50vh] overflow-y-auto">
        <ColumnMapper
          headers={state.parseResult.headers}
          fieldDefinitions={fieldDefinitions}
          mappings={state.mappings}
          onMappingsChange={handleMappingsChange}
        />
      </div>
    );
  };

  const renderPreviewStep = (): React.JSX.Element => {
    if (validateImport.isPending) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Validating import data...</p>
        </div>
      );
    }

    if (!state.parseResult) {
      return (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No data available for preview.
        </div>
      );
    }

    return (
      <div className="max-h-[50vh] overflow-y-auto">
        <ImportPreviewTable
          data={state.parseResult.sampleRows}
          mappings={state.mappings}
          fieldDefinitions={fieldDefinitions}
          validationErrors={state.validationResult?.errors}
        />
      </div>
    );
  };

  const renderImportStep = (): React.JSX.Element => {
    // Import in progress
    if (importData.isPending) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium">Importing {entityLabel}...</p>
          <p className="text-xs text-muted-foreground">This may take a moment.</p>
          <Progress value={undefined} className="w-64" />
        </div>
      );
    }

    // Import failed
    if (importData.isError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <p className="text-sm font-medium text-destructive">Import Failed</p>
          <p className="text-xs text-muted-foreground">
            An error occurred during import. Please try again.
          </p>
        </div>
      );
    }

    // Import complete
    if (state.importResult) {
      const { importResult } = state;
      return (
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center gap-3 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/30">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-sm font-medium">Import Complete</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ResultCard label="Total Rows" value={importResult.totalRows} />
            <ResultCard label="Imported" value={importResult.importedRows} variant="success" />
            <ResultCard label="Skipped" value={importResult.skippedRows} variant="warning" />
            <ResultCard
              label="Failed"
              value={importResult.errors.length}
              variant={importResult.errors.length > 0 ? 'error' : 'default'}
            />
          </div>

          {importResult.errors.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="mb-2 text-sm font-medium text-destructive">
                Errors ({importResult.errors.length})
              </p>
              <ul className="space-y-1">
                {importResult.errors.slice(0, 10).map((err, i) => (
                  <li key={i} className="text-xs text-destructive/80">
                    Row {err.row + 1}, {err.field}: {err.error}
                  </li>
                ))}
                {importResult.errors.length > 10 && (
                  <li className="text-xs text-muted-foreground">
                    ...and {importResult.errors.length - 10} more errors
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      );
    }

    return <div className="py-8 text-center text-sm text-muted-foreground">Ready to import.</div>;
  };

  const renderStepContent = (): React.JSX.Element => {
    switch (state.step) {
      case 'upload':
        return renderUploadStep();
      case 'map':
        return renderMapStep();
      case 'preview':
        return renderPreviewStep();
      case 'import':
        return renderImportStep();
    }
  };

  // ============ Render ============

  return (
    <Dialog open={open} onOpenChange={isImportComplete ? handleClose : onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import {entityLabel}</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file to import {entityLabel.toLowerCase()} into your organization.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="border-b pb-4">{renderStepIndicator()}</div>

        {/* Step content */}
        <div className="min-h-[200px] py-2">{renderStepContent()}</div>

        {/* Footer */}
        <DialogFooter className="gap-2 sm:gap-0">
          {isImportComplete ? (
            <Button onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={importData.isPending}>
                Cancel
              </Button>
              <div className="flex gap-2">
                {!isFirstStep && state.step !== 'import' && (
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    disabled={importData.isPending || validateImport.isPending}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Back
                  </Button>
                )}
                {state.step !== 'import' && (
                  <Button
                    onClick={handleNext}
                    disabled={
                      !canProceed ||
                      parseFile.isPending ||
                      validateImport.isPending ||
                      importData.isPending
                    }
                  >
                    {validateImport.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Validating...
                      </>
                    ) : state.step === 'preview' ? (
                      <>
                        Start Import
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </>
                    ) : (
                      <>
                        Next
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ Sub-components ============

interface ResultCardProps {
  label: string;
  value: number;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

function ResultCard({ label, value, variant = 'default' }: ResultCardProps): React.JSX.Element {
  const colorClasses: Record<string, string> = {
    default: 'text-foreground',
    success: 'text-emerald-600',
    warning: 'text-amber-600',
    error: 'text-destructive',
  };

  return (
    <div className="rounded-md border p-3 text-center">
      <p className={`text-2xl font-bold ${colorClasses[variant]}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
