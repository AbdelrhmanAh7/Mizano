'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  Loader2,
  FileText,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfidenceBadge } from '@/components/ai/confidence-badge';
import { useToast } from '@/components/ui/use-toast';
import {
  useOcrBatchExtract,
  useOcrTrainingSubmit,
  BatchExtractionResult,
  OcrTrainingExtractResult,
} from '@/lib/hooks/use-ocr-training';
import { useVendors } from '@/lib/hooks/use-vendors';
import { cn } from '@/lib/utils';

interface OcrBatchTrainerProps {
  preselectedVendorId?: string;
  onComplete?: (count: number) => void;
  className?: string;
}

interface FileCorrections {
  [filename: string]: Record<string, any>;
}

const EDITABLE_FIELDS = [
  'date',
  'total',
  'subtotal',
  'tax',
  'invoiceNumber',
  'vendorName',
] as const;
const FIELD_LABELS: Record<string, string> = {
  date: 'Date',
  total: 'Total',
  subtotal: 'Subtotal',
  tax: 'Tax',
  invoiceNumber: 'Invoice #',
  vendorName: 'Vendor',
};

export function OcrBatchTrainer({
  preselectedVendorId,
  onComplete,
  className,
}: OcrBatchTrainerProps) {
  const { toast } = useToast();

  const [files, setFiles] = useState<File[]>([]);
  const [vendorId, setVendorId] = useState(preselectedVendorId || '');
  const [results, setResults] = useState<BatchExtractionResult[]>([]);
  const [corrections, setCorrections] = useState<FileCorrections>({});
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [submittedCount, setSubmittedCount] = useState(0);

  const batchExtractMutation = useOcrBatchExtract();
  const submitMutation = useOcrTrainingSubmit();

  const { data: vendorsData } = useVendors();
  const vendors = vendorsData?.data || [];

  // File upload
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles((prev) => [...prev, ...acceptedFiles].slice(0, 10));
    setResults([]);
    setCorrections({});
    setSubmittedCount(0);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp', '.tiff'],
      'application/pdf': ['.pdf'],
    },
    maxSize: 15 * 1024 * 1024,
    multiple: true,
    maxFiles: 10,
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setFiles([]);
    setResults([]);
    setCorrections({});
    setExpandedRows(new Set());
    setSubmittedCount(0);
  };

  // Process batch
  const handleProcess = () => {
    if (files.length === 0 || !vendorId) return;

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('vendorId', vendorId);

    batchExtractMutation.mutate(formData, {
      onSuccess: (response) => {
        setResults(response.data);
        toast({
          title: 'Batch extraction complete',
          description: `Processed ${response.data.length} file(s)`,
        });
      },
      onError: (error: any) => {
        toast({
          variant: 'destructive',
          title: 'Batch extraction failed',
          description: error.response?.data?.message || 'Processing failed',
        });
      },
    });
  };

  // Toggle row expansion
  const toggleRow = (index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Update correction for a specific file and field
  const updateCorrection = (filename: string, field: string, value: any, originalValue: any) => {
    setCorrections((prev) => {
      const fileCorrections = { ...(prev[filename] || {}) };
      const normalizedOriginal = originalValue === null ? '' : String(originalValue);
      if (String(value) === normalizedOriginal) {
        delete fileCorrections[field];
      } else {
        fileCorrections[field] = value;
      }
      return { ...prev, [filename]: fileCorrections };
    });
  };

  // Submit all corrections
  const handleSubmitAll = async () => {
    let submitted = 0;

    for (const result of results) {
      if (!result.extraction || result.error) continue;
      const fileCorrections = corrections[result.filename];
      if (!fileCorrections || Object.keys(fileCorrections).length === 0) continue;

      try {
        await submitMutation.mutateAsync({
          vendorId,
          rawText: result.extraction.rawText,
          extractedFields: {
            date: result.extraction.date,
            total: result.extraction.total,
            subtotal: result.extraction.subtotal,
            tax: result.extraction.tax,
            invoiceNumber: result.extraction.invoiceNumber,
            vendorName: result.extraction.vendorName,
          },
          correctedFields: fileCorrections,
        });
        submitted++;
      } catch {
        // continue with other files
      }
    }

    setSubmittedCount(submitted);

    if (submitted > 0) {
      toast({
        title: 'Training data submitted',
        description: `Submitted corrections from ${submitted} file(s)`,
      });
      onComplete?.(submitted);
    }
  };

  const totalCorrections = Object.values(corrections).reduce(
    (sum, c) => sum + Object.keys(c).length,
    0,
  );
  const filesWithCorrections = Object.values(corrections).filter(
    (c) => Object.keys(c).length > 0,
  ).length;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          Batch Training
          {files.length > 0 && <Badge variant="secondary">{files.length} file(s)</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Vendor selector */}
        <div className="max-w-sm">
          <Label className="text-sm mb-1.5 block">Vendor *</Label>
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger>
              <SelectValue placeholder="Select vendor..." />
            </SelectTrigger>
            <SelectContent>
              {vendors.map((vendor: any) => (
                <SelectItem key={vendor.id} value={vendor.id}>
                  {vendor.displayName || vendor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* File upload */}
        {results.length === 0 && (
          <>
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50',
              )}
            >
              <input {...getInputProps()} />
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">
                {isDragActive ? 'Drop files here...' : 'Upload multiple bill images (up to 10)'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, PDF up to 15MB each</p>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border rounded-md p-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate max-w-[200px]">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(file.size / 1024).toFixed(0)} KB)
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeFile(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleProcess}
                    disabled={batchExtractMutation.isPending || !vendorId}
                    size="sm"
                  >
                    {batchExtractMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Processing {files.length} files...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Process All ({files.length})
                      </>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearAll}>
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Results table */}
        {results.length > 0 && (
          <div className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>File</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Corrections</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, index) => {
                  const isExpanded = expandedRows.has(index);
                  const fileCorr = corrections[result.filename] || {};
                  const corrCount = Object.keys(fileCorr).length;

                  return (
                    <React.Fragment key={index}>
                      <TableRow
                        className={cn('cursor-pointer', result.error && 'bg-red-50/50')}
                        onClick={() => toggleRow(index)}
                      >
                        <TableCell>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium truncate max-w-[150px]">
                          {result.filename}
                        </TableCell>
                        <TableCell>
                          {result.extraction ? (
                            <ConfidenceBadge
                              confidence={result.extraction.ocrConfidence}
                              size="sm"
                            />
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Error
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{result.extraction?.total?.toFixed(2) || '-'}</TableCell>
                        <TableCell>{result.extraction?.date || '-'}</TableCell>
                        <TableCell>
                          {corrCount > 0 ? (
                            <Badge className="text-xs">{corrCount}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/30 p-4">
                            {result.error ? (
                              <p className="text-sm text-destructive">{result.error}</p>
                            ) : result.extraction ? (
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {EDITABLE_FIELDS.map((field) => {
                                  const original =
                                    result.extraction![field as keyof OcrTrainingExtractResult];
                                  const corrected = fileCorr[field];
                                  const isCorrected = corrected !== undefined;

                                  return (
                                    <div key={field} className="space-y-1">
                                      <Label className="text-xs">{FIELD_LABELS[field]}</Label>
                                      <Input
                                        value={
                                          isCorrected
                                            ? String(corrected)
                                            : original === null
                                              ? ''
                                              : String(original)
                                        }
                                        onChange={(e) =>
                                          updateCorrection(
                                            result.filename,
                                            field,
                                            e.target.value,
                                            original,
                                          )
                                        }
                                        className={cn(
                                          'h-7 text-xs',
                                          isCorrected && 'border-blue-400 bg-blue-50/50',
                                        )}
                                        placeholder={
                                          original !== null ? String(original) : 'Not detected'
                                        }
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>

            {/* Batch actions */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2 text-sm">
                {totalCorrections > 0 && (
                  <Badge variant="secondary">
                    {totalCorrections} correction(s) across {filesWithCorrections} file(s)
                  </Badge>
                )}
                {submittedCount > 0 && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <Check className="h-3 w-3 mr-1" />
                    {submittedCount} submitted
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Start Over
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmitAll}
                  disabled={totalCorrections === 0 || submitMutation.isPending}
                >
                  {submitMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Submit All Corrections
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
