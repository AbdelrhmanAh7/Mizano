'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  ArrowLeft,
  Upload,
  FileText,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Sparkles,
  X,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
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
import {
  useDocumentIntakeProcess,
  useDocumentIntakeConfirm,
  type DocumentIntakeResult,
  type IntakeLineItem,
} from '@/lib/hooks/use-ai-document-intake';
import { useVendors } from '@/lib/hooks/use-vendors';
import { cn } from '@/lib/utils';

type Step = 'upload' | 'processing' | 'review' | 'confirmed';

export default function ScanBillPage() {
  const router = useRouter();
  const t = useTranslations('purchases');
  const tCommon = useTranslations('common');

  const [step, setStep] = useState<Step>('upload');
  const [progress, setProgress] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [converting, setConverting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentIntakeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editable extracted fields
  const [vendorName, setVendorName] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [date, setDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [lineItems, setLineItems] = useState<IntakeLineItem[]>([]);
  const [notes, setNotes] = useState('');

  const processDoc = useDocumentIntakeProcess();
  const confirmIntake = useDocumentIntakeConfirm();

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  const { data: vendorsData } = useVendors({ limit: 100 });
  const vendors: Array<{ id: string; name: string }> = vendorsData?.data || [];

  const handleFileSelect = useCallback(async (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      setError('File too large. Maximum size is 15MB.');
      return;
    }

    setError(null);

    const isHeic =
      file.type === 'image/heic' ||
      file.type === 'image/heif' ||
      file.name.toLowerCase().endsWith('.heic') ||
      file.name.toLowerCase().endsWith('.heif');

    if (isHeic) {
      setConverting(true);
      try {
        const heic2any = (await import('heic2any')).default;
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
        const blob = Array.isArray(converted) ? converted[0] : converted;
        const jpegFile = new File([blob], file.name.replace(/\.hei[cf]$/i, '.jpg'), {
          type: 'image/jpeg',
        });
        setSelectedFile(jpegFile);
        setPreviewUrl(URL.createObjectURL(jpegFile));
      } catch (err) {
        setError('Failed to convert HEIC image. Please convert it manually to JPEG or PNG.');
        setSelectedFile(null);
        setPreviewUrl(null);
      } finally {
        setConverting(false);
      }
      return;
    }

    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const startProgressSimulation = () => {
    setProgress(0);
    // Slowly advance — first call can take 2+ min while Ollama loads the model
    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev < 40) return prev + 1.5;
        if (prev < 70) return prev + 0.4;
        if (prev < 90) return prev + 0.1;
        return prev; // hold at 90 until done
      });
    }, 500);
  };

  const stopProgressSimulation = (finished: boolean) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (finished) setProgress(100);
  };

  const handleProcess = async () => {
    if (!selectedFile) return;

    setStep('processing');
    setError(null);
    startProgressSimulation();

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('forceType', 'BILL');

      const response = await processDoc.mutateAsync(formData);
      const intake: DocumentIntakeResult = response.data;
      stopProgressSimulation(true);
      setResult(intake);

      // Populate editable fields
      setVendorName(intake.extractedFields.vendorName || '');
      setDocumentNumber(intake.extractedFields.documentNumber || '');
      setDate(intake.extractedFields.date || new Date().toISOString().slice(0, 10));
      setDueDate(intake.extractedFields.dueDate || '');
      setLineItems(
        intake.extractedFields.lineItems.length > 0
          ? intake.extractedFields.lineItems
          : [{ description: '', quantity: 1, unitPrice: 0, total: 0 }],
      );

      // Auto-select matched vendor
      if (intake.matchedVendor) {
        setSelectedVendorId(intake.matchedVendor.id);
      }

      setStep('review');
    } catch (err) {
      stopProgressSimulation(false);
      setProgress(0);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('timeout')) {
        setError(
          'Processing timed out. This can happen on first use while the AI model loads. Please try again — subsequent scans are much faster.',
        );
      } else {
        setError(msg || 'Failed to process document. Please try again.');
      }
      setStep('upload');
    }
  };

  const handleConfirm = async () => {
    if (!selectedVendorId) {
      setError('Please select a vendor.');
      return;
    }
    if (lineItems.length === 0) {
      setError('Please add at least one line item.');
      return;
    }

    setError(null);

    try {
      const response = await confirmIntake.mutateAsync({
        type: 'BILL',
        vendorId: selectedVendorId,
        date: date || new Date().toISOString().slice(0, 10),
        dueDate: dueDate || date || new Date().toISOString().slice(0, 10),
        documentNumber: documentNumber || undefined,
        lines: lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          rate: item.unitPrice,
        })),
        notes: notes || undefined,
        corrections: result
          ? {
              vendorName,
              documentNumber,
              date,
              dueDate,
            }
          : undefined,
      });

      const created = response.data;
      setStep('confirmed');

      // Navigate to the new bill after a short delay
      setTimeout(() => {
        router.push(`/purchases/bills/${created.id}`);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bill. Please try again.');
    }
  };

  const updateLineItem = (index: number, field: keyof IntakeLineItem, value: string | number) => {
    setLineItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      // Auto-calculate total
      if (field === 'quantity' || field === 'unitPrice') {
        updated[index].total = updated[index].quantity * updated[index].unitPrice;
      }
      return updated;
    });
  };

  const addLineItem = () => {
    setLineItems((prev) => [...prev, { description: '', quantity: 1, unitPrice: 0, total: 0 }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const grandTotal = lineItems.reduce((sum, item) => sum + (item.total || 0), 0);

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) return <Badge variant="default">High</Badge>;
    if (confidence >= 0.5) return <Badge variant="secondary">Medium</Badge>;
    return <Badge variant="destructive">Low</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Go back">
          <Link href="/purchases/bills">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scan Bill</h1>
          <p className="text-muted-foreground">
            Upload a document and let AI extract bill data automatically
          </p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        <StepBadge step={1} label="Upload" active={step === 'upload'} done={step !== 'upload'} />
        <Separator className="w-8" />
        <StepBadge
          step={2}
          label="Processing"
          active={step === 'processing'}
          done={step === 'review' || step === 'confirmed'}
        />
        <Separator className="w-8" />
        <StepBadge step={3} label="Review" active={step === 'review'} done={step === 'confirmed'} />
        <Separator className="w-8" />
        <StepBadge step={4} label="Done" active={step === 'confirmed'} done={false} />
      </div>

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <p>{error}</p>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-6 w-6"
                onClick={() => setError(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Document
            </CardTitle>
            <CardDescription>
              Upload any invoice, bill, or receipt (image or PDF). AI will extract the data
              automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors',
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50',
              )}
              onDragOver={(e) => {
                e.preventDefault();
                if (!converting) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={converting ? undefined : handleDrop}
              onClick={() => {
                if (converting) return;
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '*/*';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFileSelect(file);
                };
                input.click();
              }}
            >
              {converting ? (
                <div className="space-y-3">
                  <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
                  <div>
                    <p className="font-medium">Converting HEIC to JPEG...</p>
                    <p className="text-sm text-muted-foreground">This only takes a moment.</p>
                  </div>
                </div>
              ) : selectedFile ? (
                <div className="space-y-3">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="max-h-48 mx-auto rounded-lg shadow-sm"
                    />
                  ) : (
                    <FileText className="h-16 w-16 mx-auto text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      setPreviewUrl(null);
                    }}
                  >
                    <X className="mr-1 h-3 w-3" />
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <p className="font-medium">Drop your document here or click to browse</p>
                    <p className="text-sm text-muted-foreground">
                      Supports images (JPEG, PNG, WebP, HEIC) and PDF — max 15MB
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleProcess} disabled={!selectedFile || converting} size="lg">
                <Sparkles className="mr-2 h-4 w-4" />
                Process with AI
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Processing */}
      {step === 'processing' && (
        <Card>
          <CardContent className="py-16">
            <div className="max-w-md mx-auto space-y-6">
              <div className="text-center space-y-2">
                <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
                <p className="text-lg font-medium">Processing your document...</p>
                <p className="text-sm text-muted-foreground">
                  Ollama AI is analysing your document. First scan may take 1-3 minutes while the
                  model loads.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>
                    {progress < 30
                      ? 'Uploading document...'
                      : progress < 60
                        ? 'Extracting text & fields...'
                        : progress < 85
                          ? 'Classifying & matching vendors...'
                          : progress < 100
                            ? 'Finalising results...'
                            : 'Done!'}
                  </span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {step === 'review' && result && (
        <div className="space-y-6">
          {/* Extraction Summary */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  AI Extraction Results
                </CardTitle>
                <div className="flex items-center gap-2">
                  {result.extractionMethod && (
                    <Badge variant="outline">{result.extractionMethod}</Badge>
                  )}
                  {getConfidenceBadge(result.ocrConfidence)}
                </div>
              </div>
              <CardDescription>
                Review and correct the extracted data below, then confirm to create a draft bill.
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Duplicate Warning */}
          {result.duplicateWarning?.isDuplicate && (
            <Card className="border-yellow-500">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="h-5 w-5" />
                  <div>
                    <p className="font-medium">Possible duplicate detected</p>
                    <p className="text-sm">
                      This document appears similar to an existing record (
                      {Math.round((result.duplicateWarning.similarity || 0) * 100)}% match).
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Document Details */}
          <Card>
            <CardHeader>
              <CardTitle>Document Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Vendor Selection */}
                <div className="space-y-2">
                  <Label>Vendor</Label>
                  {vendors.length > 0 ? (
                    <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select vendor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {vendors.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id}>
                            {vendor.name}
                            {result.matchedVendor?.id === vendor.id && ' (AI Match)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
                  )}
                  {result.matchedVendor && (
                    <p className="text-xs text-muted-foreground">
                      AI matched: {result.matchedVendor.name} (
                      {Math.round(result.matchedVendor.similarity * 100)}% confidence)
                    </p>
                  )}
                  {result.vendorCandidates.length > 1 && (
                    <div className="text-xs text-muted-foreground">
                      Other candidates:{' '}
                      {result.vendorCandidates
                        .filter((c) => c.id !== result.matchedVendor?.id)
                        .slice(0, 3)
                        .map((c) => c.name)
                        .join(', ')}
                    </div>
                  )}
                </div>

                {/* Document Number */}
                <div className="space-y-2">
                  <Label>Document Number</Label>
                  <Input
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    placeholder="e.g. INV-001"
                  />
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>

                {/* Due Date */}
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t('lineItems.title')}</CardTitle>
                <Button variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">{t('lineItems.description')}</TableHead>
                    <TableHead className="text-right">{t('lineItems.quantity')}</TableHead>
                    <TableHead className="text-right">{t('lineItems.rate')}</TableHead>
                    <TableHead className="text-right">{t('lineItems.amount')}</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          placeholder="Item description"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          className="text-right w-20"
                          value={item.quantity}
                          onChange={(e) =>
                            updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          className="text-right w-28"
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {item.total.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {lineItems.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeLineItem(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 flex justify-end">
                <div className="w-64">
                  <div className="flex justify-between text-lg font-bold">
                    <span>{tCommon('total')}</span>
                    <span className="font-mono">{grandTotal.toFixed(2)}</span>
                  </div>
                  {result.extractedFields.total != null &&
                    Math.abs(grandTotal - result.extractedFields.total) > 0.01 && (
                      <p className="text-xs text-yellow-600 mt-1">
                        AI extracted total: {result.extractedFields.total.toFixed(2)} (differs from
                        line items)
                      </p>
                    )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Accounting Suggestion */}
          {result.accountingEntry && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">AI Accounting Suggestion</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Debit:</span>{' '}
                    {result.accountingEntry.debitAccount || '-'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Credit:</span>{' '}
                    {result.accountingEntry.creditAccount || '-'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tax:</span>{' '}
                    {result.accountingEntry.taxAccount || '-'}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes..."
                rows={2}
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setStep('upload');
                setResult(null);
                setError(null);
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Re-upload
            </Button>
            <Button onClick={handleConfirm} disabled={confirmIntake.isPending} size="lg">
              {confirmIntake.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm &amp; Create Bill
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Confirmed */}
      {step === 'confirmed' && (
        <Card>
          <CardContent className="py-16">
            <div className="text-center space-y-4">
              <CheckCircle2 className="h-16 w-16 mx-auto text-green-500" />
              <div>
                <p className="text-lg font-medium">Bill created successfully!</p>
                <p className="text-sm text-muted-foreground">Redirecting to the bill...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step badge component
// ---------------------------------------------------------------------------

function StepBadge({
  step,
  label,
  active,
  done,
}: {
  step: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium',
          active && 'bg-primary text-primary-foreground',
          done && 'bg-green-500 text-white',
          !active && !done && 'bg-muted text-muted-foreground',
        )}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : step}
      </div>
      <span
        className={cn(
          'text-sm',
          active && 'font-medium',
          !active && !done && 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </div>
  );
}
