'use client';

import { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Loader2, FileText, X, Check, Sparkles, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfidenceBadge } from '@/components/ai/confidence-badge';
import { useToast } from '@/components/ui/use-toast';
import {
  useOcrTrainingExtract,
  useOcrTrainingSubmit,
  OcrTrainingExtractResult,
} from '@/lib/hooks/use-ocr-training';
import { useVendors } from '@/lib/hooks/use-vendors';
import { cn } from '@/lib/utils';

interface OcrTrainingViewerProps {
  imageFile?: File;
  imagePreview?: string;
  extractionResult?: OcrTrainingExtractResult;
  isExtracting?: boolean;
  vendorId?: string;
  onVendorChange?: (vendorId: string) => void;
  onExtract?: () => void;
  onSubmitCorrections?: (result: { sampleCount: number; isActive: boolean }) => void;
  onDismiss?: () => void;
  isSubmitting?: boolean;
  showVendorSelector?: boolean;
  compact?: boolean;
  className?: string;
}

const EDITABLE_FIELDS = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'total', label: 'Total', type: 'number' },
  { key: 'subtotal', label: 'Subtotal', type: 'number' },
  { key: 'tax', label: 'Tax', type: 'number' },
  { key: 'invoiceNumber', label: 'Invoice Number', type: 'text' },
  { key: 'vendorName', label: 'Vendor Name', type: 'text' },
] as const;

export function OcrTrainingViewer({
  imageFile: externalFile,
  imagePreview: externalPreview,
  extractionResult: externalResult,
  isExtracting: externalExtracting,
  vendorId: externalVendorId,
  onVendorChange,
  onExtract,
  onSubmitCorrections,
  onDismiss,
  isSubmitting: externalSubmitting,
  showVendorSelector = false,
  compact = false,
  className,
}: OcrTrainingViewerProps) {
  const { toast } = useToast();

  // Internal state for standalone mode
  const [internalFile, setInternalFile] = useState<File | null>(null);
  const [internalPreview, setInternalPreview] = useState<string | null>(null);
  const [internalVendorId, setInternalVendorId] = useState('');
  const [correctedFields, setCorrectedFields] = useState<Record<string, unknown>>({});

  // Mutations
  const extractMutation = useOcrTrainingExtract();
  const submitMutation = useOcrTrainingSubmit();

  // Vendors
  const { data: vendorsData } = useVendors();
  const vendors = vendorsData?.data || [];

  // Resolved state (external or internal)
  const file = externalFile || internalFile;
  const preview = externalPreview || internalPreview;
  const vendorId = externalVendorId || internalVendorId;
  const result =
    externalResult || (extractMutation.data?.data as OcrTrainingExtractResult | undefined);
  const isExtracting = externalExtracting || extractMutation.isPending;
  const isSubmitting = externalSubmitting || submitMutation.isPending;

  // Original extracted values for comparison
  const originalValues = useMemo(() => {
    if (!result) return {};
    return {
      date: result.date,
      total: result.total,
      subtotal: result.subtotal,
      tax: result.tax,
      invoiceNumber: result.invoiceNumber,
      vendorName: result.vendorName,
    };
  }, [result]);

  // Merged values (original + corrections)
  const currentValues = useMemo(() => {
    return { ...originalValues, ...correctedFields };
  }, [originalValues, correctedFields]);

  const correctionCount = Object.keys(correctedFields).length;

  // File upload
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setInternalFile(selectedFile);
      setCorrectedFields({});
      if (selectedFile.type.startsWith('image/')) {
        setInternalPreview(URL.createObjectURL(selectedFile));
      } else {
        setInternalPreview(null);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp', '.tiff', '.heic', '.heif'],
      'application/pdf': ['.pdf'],
    },
    maxSize: 15 * 1024 * 1024,
    multiple: false,
  });

  const clearFile = () => {
    setInternalFile(null);
    setInternalPreview(null);
    setCorrectedFields({});
    extractMutation.reset();
  };

  // Extract
  const handleExtract = () => {
    if (onExtract) {
      onExtract();
      return;
    }
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    if (vendorId) formData.append('vendorId', vendorId);

    extractMutation.mutate(formData, {
      onError: (error: { response?: { data?: { message?: string } } }) => {
        toast({
          variant: 'destructive',
          title: 'Extraction failed',
          description: error.response?.data?.message || 'Failed to extract data',
        });
      },
    });
  };

  // Update correction
  const handleFieldChange = (field: string, value: string | number | null) => {
    const original = originalValues[field as keyof typeof originalValues];
    const normalizedOriginal = original === null ? '' : String(original);
    const normalizedValue = String(value);

    if (normalizedOriginal === normalizedValue) {
      // Reverted to original
      setCorrectedFields((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    } else {
      setCorrectedFields((prev) => ({ ...prev, [field]: value }));
    }
  };

  // Submit corrections
  const handleSubmit = () => {
    if (!result || correctionCount === 0) return;

    if (!vendorId) {
      toast({
        variant: 'destructive',
        title: 'Vendor required',
        description: 'Please select a vendor before submitting corrections.',
      });
      return;
    }

    const data = {
      vendorId,
      rawText: result.rawText,
      extractedFields: originalValues,
      correctedFields,
    };

    submitMutation.mutate(data, {
      onSuccess: (response) => {
        const res = response.data;
        toast({
          title: 'Training data submitted',
          description: `${correctionCount} correction(s) saved. Vendor has ${res.sampleCount} training sample(s).${res.isActive ? ' Layout learning is now active!' : ''}`,
        });
        setCorrectedFields({});
        onSubmitCorrections?.({
          sampleCount: res.sampleCount,
          isActive: res.isActive,
        });
      },
      onError: (error: { response?: { data?: { message?: string } } }) => {
        toast({
          variant: 'destructive',
          title: 'Submission failed',
          description: error.response?.data?.message || 'Failed to submit training data',
        });
      },
    });
  };

  // Build highlight segments for safe React-based rendering (no dangerouslySetInnerHTML)
  const highlightSegments = useMemo(() => {
    if (!result?.rawText) return [];
    const text = result.rawText;
    const valuesToHighlight: string[] = [];

    for (const val of Object.values(originalValues)) {
      if (val !== null && val !== undefined && String(val).length >= 2) {
        valuesToHighlight.push(String(val));
      }
    }

    // Sort by length desc to match longest first
    valuesToHighlight.sort((a, b) => b.length - a.length);

    // Find all match positions
    const matches: { start: number; end: number }[] = [];
    for (const val of valuesToHighlight) {
      const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        // Skip if overlapping with an existing match
        if (!matches.some((m) => start < m.end && end > m.start)) {
          matches.push({ start, end });
        }
      }
    }

    // Sort matches by position
    matches.sort((a, b) => a.start - b.start);

    // Build segments: alternating plain text and highlighted text
    const segments: { text: string; highlighted: boolean }[] = [];
    let cursor = 0;
    for (const m of matches) {
      if (m.start > cursor) {
        segments.push({ text: text.slice(cursor, m.start), highlighted: false });
      }
      segments.push({ text: text.slice(m.start, m.end), highlighted: true });
      cursor = m.end;
    }
    if (cursor < text.length) {
      segments.push({ text: text.slice(cursor), highlighted: false });
    }

    return segments;
  }, [result?.rawText, originalValues]);

  const gridCols = compact ? 'lg:grid-cols-2' : 'lg:grid-cols-3';

  return (
    <div className={cn('space-y-4', className)}>
      {/* Vendor selector */}
      {showVendorSelector && (
        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-sm">
            <Label className="text-sm font-medium mb-1.5 block">Vendor</Label>
            <Select
              value={vendorId}
              onValueChange={(val) => {
                setInternalVendorId(val);
                onVendorChange?.(val);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select vendor for training..." />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((vendor: { id: string; displayName?: string; name: string }) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.displayName || vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className={cn('grid gap-4', gridCols)}>
        {/* Column 1: Image */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Document</CardTitle>
          </CardHeader>
          <CardContent>
            {!file && !externalPreview ? (
              <div
                {...getRootProps()}
                className={cn(
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  isDragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-primary/50',
                )}
              >
                <input {...getInputProps()} />
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">
                  {isDragActive ? 'Drop here...' : 'Upload bill image'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, PDF up to 15MB</p>
              </div>
            ) : (
              <div className="space-y-3">
                {preview ? (
                  <div className="relative aspect-[3/4] bg-muted rounded-lg overflow-hidden">
                    <img src={preview} alt="Document" className="w-full h-full object-contain" />
                    {!externalFile && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={clearFile}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="relative flex flex-col items-center justify-center aspect-[3/4] bg-muted rounded-lg">
                    <FileText className="h-12 w-12 text-muted-foreground mb-2" />
                    <p className="text-xs font-medium">{file?.name || 'PDF Document'}</p>
                  </div>
                )}

                {result && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">OCR Confidence</span>
                    <ConfidenceBadge confidence={result.ocrConfidence} size="sm" />
                  </div>
                )}

                {!result && !isExtracting && (
                  <Button onClick={handleExtract} className="w-full" size="sm">
                    <Sparkles className="h-4 w-4 mr-1" />
                    Extract
                  </Button>
                )}
                {isExtracting && (
                  <Button disabled className="w-full" size="sm">
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Extracting...
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Column 2: Raw OCR Text (hidden in compact mode) */}
        {!compact && result && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                Raw OCR Text
                <Badge variant="secondary" className="text-xs">
                  {result.rawText.length} chars
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] rounded-md border p-3 bg-muted/30">
                <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">
                  {highlightSegments.map((segment, i) =>
                    segment.highlighted ? (
                      <mark key={i} className="bg-yellow-200 dark:bg-yellow-900 rounded px-0.5">
                        {segment.text}
                      </mark>
                    ) : (
                      segment.text
                    ),
                  )}
                </pre>
              </ScrollArea>
              <p className="text-xs text-muted-foreground mt-2">
                Highlighted regions show values that were extracted by OCR.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Column 3: Editable Fields */}
        {result && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                Extracted Fields
                {correctionCount > 0 && (
                  <Badge variant="default" className="text-xs">
                    {correctionCount} correction(s)
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {EDITABLE_FIELDS.map(({ key, label, type }) => {
                const original = originalValues[key as keyof typeof originalValues];
                const current = currentValues[key as keyof typeof currentValues];
                const isCorrected = key in correctedFields;
                const confidence = result.fieldConfidence?.[key];

                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">
                        {label}
                        {confidence !== undefined && confidence > 0 && (
                          <span
                            className={cn(
                              'ml-1 text-xs font-normal',
                              confidence >= 0.8
                                ? 'text-green-600'
                                : confidence >= 0.6
                                  ? 'text-yellow-600'
                                  : 'text-red-600',
                            )}
                          >
                            ({Math.round(confidence * 100)}%)
                          </span>
                        )}
                      </Label>
                      {isCorrected && (
                        <div className="flex items-center gap-1">
                          <Badge
                            variant="outline"
                            className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                          >
                            Corrected
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() =>
                              handleFieldChange(key, original === null ? '' : original)
                            }
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <Input
                      type={type}
                      value={current === null ? '' : String(current)}
                      onChange={(e) => {
                        const val =
                          type === 'number'
                            ? e.target.value === ''
                              ? null
                              : parseFloat(e.target.value)
                            : e.target.value;
                        handleFieldChange(key, val);
                      }}
                      className={cn(
                        'h-8 text-sm',
                        isCorrected && 'border-blue-400 bg-blue-50/50',
                        !isCorrected &&
                          confidence !== undefined &&
                          confidence < 0.6 &&
                          confidence > 0 &&
                          'border-yellow-400 bg-yellow-50/50',
                      )}
                      step={type === 'number' ? '0.01' : undefined}
                    />
                    {isCorrected && original !== null && (
                      <p className="text-xs text-muted-foreground">Original: {String(original)}</p>
                    )}
                  </div>
                );
              })}

              {/* Line items summary */}
              {result.lineItems.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground">
                    {result.lineItems.length} line item(s) extracted
                  </p>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    {result.lineItems.slice(0, 3).map((item, i) => (
                      <li key={i} className="truncate">
                        {item.description} &mdash; {item.quantity} x {item.unitPrice.toFixed(2)}
                      </li>
                    ))}
                    {result.lineItems.length > 3 && <li>+{result.lineItems.length - 3} more...</li>}
                  </ul>
                </div>
              )}

              {/* Submit button */}
              <div className="pt-3 border-t flex items-center gap-2">
                <Button
                  onClick={handleSubmit}
                  disabled={correctionCount === 0 || isSubmitting || !vendorId}
                  size="sm"
                  className="flex-1"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Submit {correctionCount} Correction(s)
                    </>
                  )}
                </Button>
                {onDismiss && (
                  <Button variant="outline" size="sm" onClick={onDismiss}>
                    Cancel
                  </Button>
                )}
              </div>
              {!vendorId && correctionCount > 0 && (
                <p className="text-xs text-destructive">Select a vendor to submit corrections.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
