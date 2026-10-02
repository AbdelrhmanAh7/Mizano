'use client';

import { useState, useCallback, useEffect } from 'react';
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
  UserPlus,
  Zap,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  useDocumentIntakeStream,
  useDocumentIntakeConfirm,
  type DocumentIntakeResult,
} from '@/lib/hooks/use-ai-document-intake';
import { useCreateVendor } from '@/lib/hooks/use-vendors';
import { resolveScanLineTaxes, toDecimalString } from '@/lib/document-intake-tax';
import { BillForm, type BillFormDefaultValues } from '@/components/purchases/bill-form';
import { IntakeFieldValidation } from '@/components/purchases/intake-field-validation';
import {
  partitionBlocking,
  uncorrectedBlockingFields,
  warningFields,
} from '@/lib/intake-validation';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

type Step = 'upload' | 'processing' | 'review' | 'confirmed' | 'existing';

interface UnresolvedTaxLine {
  lineNumber: number;
  description: string;
  extractedTaxAmount: string | null;
}

/** BillForm submits parsed numbers; send them back to the API as decimal strings. */
function toConfirmDecimal(value: unknown, field: string, lineNumber: number): string {
  const text =
    typeof value === 'number' || typeof value === 'string' ? toDecimalString(value) : null;
  if (text === null) {
    throw new Error(`Line ${lineNumber}: ${field} must be a non-negative number`);
  }
  return text;
}

export default function ScanBillPage() {
  const router = useRouter();
  const t = useTranslations('ai.intake');

  const [step, setStep] = useState<Step>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [converting, setConverting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localResult, setLocalResult] = useState<DocumentIntakeResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [scanDefaults, setScanDefaults] = useState<BillFormDefaultValues | null>(null);
  const [scanMode, setScanMode] = useState<'fast' | 'slow'>('fast');
  const [unresolvedTaxLines, setUnresolvedTaxLines] = useState<UnresolvedTaxLine[]>([]);
  const [taxReviewed, setTaxReviewed] = useState(false);
  const [warningsShown, setWarningsShown] = useState(false);
  const [amountsAcknowledged, setAmountsAcknowledged] = useState(false);
  const [dateAcknowledged, setDateAcknowledged] = useState(false);
  const tv = useTranslations('ai.intake.validation');

  // SSE-based document intake
  const intake = useDocumentIntakeStream();
  const confirmIntake = useDocumentIntakeConfirm();
  const createVendor = useCreateVendor();

  // Transition to review when SSE completes
  useEffect(() => {
    if (intake.result && step === 'processing') {
      const result = intake.result;
      setLocalResult(result);

      // Extraction yields tax AMOUNTS; the form takes a tax RATE (%). Derive the
      // rate only when exact; otherwise leave it empty and flag it for review.
      const lineItems = result.extractedFields.lineItems;
      const taxes = resolveScanLineTaxes(lineItems, {
        subtotal: result.extractedFields.subtotal,
        tax: result.extractedFields.tax,
      });
      const unresolved: UnresolvedTaxLine[] =
        lineItems.length > 0
          ? lineItems.flatMap((item, i) =>
              taxes[i].unresolved
                ? [
                    {
                      lineNumber: i + 1,
                      description: item.description,
                      extractedTaxAmount: taxes[i].extractedTaxAmount,
                    },
                  ]
                : [],
            )
          : [{ lineNumber: 1, description: '', extractedTaxAmount: null }];
      setUnresolvedTaxLines(unresolved);
      setTaxReviewed(false);

      setScanDefaults({
        vendorId: result.matchedVendor?.id || '',
        date: result.extractedFields.date || format(new Date(), 'yyyy-MM-dd'),
        dueDate: result.extractedFields.dueDate || '',
        reference: result.extractedFields.documentNumber || '',
        currencyCode: result.extractedFields.currency || '',
        notes: '',
        lines:
          result.extractedFields.lineItems.length > 0
            ? lineItems.map((item, i) => ({
                description: item.description,
                quantity: toDecimalString(item.quantity) ?? '',
                rate: toDecimalString(item.unitPrice) ?? '',
                taxRate: taxes[i].taxRatePercent,
              }))
            : [{ description: '', quantity: '1', rate: '', taxRate: '' }],
      });

      setStep('review');
    }
  }, [intake.result, step]);

  // An identical file was already approved: show its draft instead of a review form.
  useEffect(() => {
    if (intake.existingDraft && step === 'processing') setStep('existing');
  }, [intake.existingDraft, step]);

  // Handle errors
  useEffect(() => {
    if (intake.error && step === 'processing') {
      setLocalError(intake.error);
      setStep('upload');
    }
  }, [intake.error, step]);

  const handleFileSelect = useCallback(async (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      setLocalError('File too large. Maximum size is 15MB.');
      return;
    }

    setLocalError(null);

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
      } catch {
        setLocalError('Failed to convert HEIC image. Please convert it manually to JPEG or PNG.');
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

  const handleProcess = async () => {
    if (!selectedFile) return;

    setStep('processing');
    setLocalError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('forceType', 'BILL');
    formData.append('strategy', scanMode);

    await intake.processDocument(formData);
  };

  const handleConfirm = async (formData: Record<string, unknown>) => {
    setLocalError(null);
    if (unresolvedTaxLines.length > 0 && !taxReviewed) {
      setLocalError(
        'Some tax rates could not be determined from the document. Review the tax % on the ' +
          'flagged lines and tick the confirmation before creating the bill.',
      );
      return;
    }
    const validation = localResult?.validation;
    if (validation && localResult) {
      const blocked = uncorrectedBlockingFields(validation, localResult.extractedFields, {
        date: String(formData.date ?? ''),
        currencyCode: String(formData.currencyCode ?? ''),
        lines:
          (formData.lines as Array<{ quantity: string | number; rate: string | number }>) ?? [],
        prefilledDate: scanDefaults?.date,
      });
      const { hard, amounts, missingDate } = partitionBlocking(blocked, validation);
      if (hard.length > 0) {
        setLocalError(
          tv('blockedInvalid', { fields: hard.map((f) => tv(`fields.${f}`)).join(', ') }),
        );
        return;
      }
      if (amounts.length > 0 && !amountsAcknowledged) {
        setAmountsAcknowledged(true);
        setLocalError(
          tv('confirmAmounts', { fields: amounts.map((f) => tv(`fields.${f}`)).join(', ') }),
        );
        return;
      }
      if (missingDate && !dateAcknowledged) {
        setDateAcknowledged(true);
        setLocalError(tv('confirmMissingDate'));
        return;
      }
      if (warningFields(validation).length > 0 && !warningsShown) {
        setWarningsShown(true);
        setLocalError(tv('warnBeforeConfirm'));
        return;
      }
    }
    try {
      const lines = (
        formData.lines as Array<{
          itemId: string | null;
          accountId: string | null;
          description: string;
          quantity: string;
          rate: string;
          taxRate: string;
        }>
      ).map((l, i) => ({
        itemId: l.itemId || undefined,
        accountId: l.accountId || undefined,
        description: l.description,
        quantity: toConfirmDecimal(l.quantity, 'quantity', i + 1),
        rate: toConfirmDecimal(l.rate, 'rate', i + 1),
        // The form field is a PERCENTAGE; reviewed lines send it explicitly.
        taxRatePercent: toConfirmDecimal(l.taxRate, 'tax %', i + 1),
      }));

      const response = await confirmIntake.mutateAsync({
        type: 'BILL',
        vendorId: formData.vendorId as string,
        date: formData.date as string,
        dueDate: formData.dueDate as string,
        reference: (formData.reference as string) || undefined,
        currencyCode: (formData.currencyCode as string) || undefined,
        lines,
        notes: (formData.notes as string) || undefined,
        projectId: (formData.projectId as string) || undefined,
        jobId: intake.jobId ?? undefined,
        corrections: localResult
          ? {
              vendorName: localResult.extractedFields.vendorName || '',
              documentNumber: formData.reference as string,
              date: formData.date as string,
              dueDate: formData.dueDate as string,
            }
          : undefined,
      });

      setStep('confirmed');
      setTimeout(() => {
        router.push(`/purchases/bills/${response.data.id}`);
      }, 2000);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Failed to create bill. Please try again.',
      );
    }
  };

  const handleReupload = () => {
    setStep('upload');
    setLocalResult(null);
    setWarningsShown(false);
    setAmountsAcknowledged(false);
    setDateAcknowledged(false);
    setScanDefaults(null);
    setLocalError(null);
    setUnresolvedTaxLines([]);
    setTaxReviewed(false);
    intake.reset();
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) return <Badge variant="default">High</Badge>;
    if (confidence >= 0.5) return <Badge variant="secondary">Medium</Badge>;
    return <Badge variant="destructive">Low</Badge>;
  };

  // Stage-specific messages for the processing UI
  const stageMessage =
    intake.message ||
    (intake.stage === 'received'
      ? 'Uploading document...'
      : intake.stage === 'extracting'
        ? 'AI is reading your document...'
        : intake.stage === 'classifying'
          ? 'Classifying document type...'
          : intake.stage === 'matching'
            ? 'Matching vendors and customers...'
            : 'Processing...');

  const result = localResult;
  const error = localError;

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
              {intake.jobStatus && (
                <Badge variant="destructive" data-testid="intake-job-status">
                  {t(`status.${intake.jobStatus}`)}
                </Badge>
              )}
              {intake.canRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLocalError(null);
                    setStep('processing');
                    void intake.retry();
                  }}
                >
                  {t('retry')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-6 w-6"
                onClick={() => setLocalError(null)}
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

            {/* Scan Mode Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Scan Mode:</span>
                <div className="flex rounded-lg border p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setScanMode('fast')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      scanMode === 'fast'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Fast
                  </button>
                  <button
                    type="button"
                    onClick={() => setScanMode('slow')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      scanMode === 'slow'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Accurate
                  </button>
                </div>
              </div>
              <Button onClick={handleProcess} disabled={!selectedFile || converting} size="lg">
                <Sparkles className="mr-2 h-4 w-4" />
                Process with AI
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {scanMode === 'fast'
                ? 'Fast: PaddleOCR + text model — quick extraction, works best with clear printed documents.'
                : 'Accurate: qwen3-vl:8b vision model — slower but handles handwriting, poor scans, and complex layouts better.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Processing — real-time progress from SSE */}
      {step === 'processing' && (
        <Card>
          <CardContent className="py-16">
            <div className="max-w-md mx-auto space-y-6">
              <div className="text-center space-y-2">
                <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
                <p className="text-lg font-medium">{stageMessage}</p>
                <p className="text-sm text-muted-foreground">
                  AI is processing your document. You&apos;ll see live progress below.
                </p>
                {intake.isDuplicate && (
                  <p className="text-xs text-muted-foreground" role="status">
                    {t('duplicate')}
                  </p>
                )}
                {intake.jobStatus && (
                  <Badge variant="secondary" data-testid="intake-job-status">
                    {t(`status.${intake.jobStatus}`)}
                  </Badge>
                )}
                {intake.isReconnecting && (
                  <p className="text-xs text-yellow-600" role="status">
                    Connection interrupted — reconnecting...
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{stageMessage}</span>
                  <span>{Math.round(intake.progress)}%</span>
                </div>
                <Progress value={intake.progress} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {step === 'review' && result && scanDefaults && (
        <div className="space-y-6">
          {intake.isDuplicate && (
            <p className="text-sm text-muted-foreground" role="status">
              {t('duplicate')}
            </p>
          )}
          {/* AI Context Panel */}
          {intake.jobStatus === 'NEEDS_REVIEW' && (
            <Card className="border-yellow-500" role="status">
              <CardContent className="flex items-center gap-2 pt-6 text-yellow-700">
                <AlertTriangle className="h-4 w-4" />
                <p>{t('needsReviewNotice')}</p>
              </CardContent>
            </Card>
          )}

          {/* Extraction Results header */}
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
                  <span className="text-xs text-muted-foreground">
                    Classification: {Math.round(result.classificationConfidence * 100)}%
                  </span>
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

          {/* AI Vendor Intelligence */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">AI Vendor Intelligence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {result.matchedVendor ? (
                <p>
                  <span className="text-muted-foreground">AI matched:</span>{' '}
                  <span className="font-medium">{result.matchedVendor.name}</span>{' '}
                  <span className="text-muted-foreground">
                    ({Math.round(result.matchedVendor.similarity * 100)}% confidence)
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground">No existing vendor matched.</p>
              )}

              {result.vendorCandidates.length > 1 && (
                <p className="text-muted-foreground">
                  Other candidates:{' '}
                  {result.vendorCandidates
                    .filter((c) => c.id !== result.matchedVendor?.id)
                    .slice(0, 3)
                    .map((c) => c.name)
                    .join(', ')}
                </p>
              )}

              {result.extractedFields.vendorTaxId && (
                <p>
                  <span className="text-muted-foreground">Vendor Tax ID / VAT:</span>{' '}
                  {result.extractedFields.vendorTaxId}
                </p>
              )}

              {result.extractedFields.paymentTerms && (
                <p>
                  <span className="text-muted-foreground">Payment Terms:</span>{' '}
                  {result.extractedFields.paymentTerms}
                </p>
              )}

              {!result.matchedVendor && result.suggestCreateVendor && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={createVendor.isPending}
                  onClick={async () => {
                    const suggestion = result.suggestCreateVendor!;
                    const created = await createVendor.mutateAsync({
                      name: suggestion.name,
                      email: suggestion.email ?? undefined,
                      phone: suggestion.phone ?? undefined,
                      taxId: suggestion.taxId ?? undefined,
                    });
                    if (created?.data?.id) {
                      setScanDefaults((prev) =>
                        prev ? { ...prev, vendorId: created.data.id } : prev,
                      );
                    }
                  }}
                >
                  {createVendor.isPending ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 h-3 w-3" />
                  )}
                  Create &quot;{result.suggestCreateVendor.name}&quot; as new vendor
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Extracted Financial Summary */}
          {(result.extractedFields.subtotal != null ||
            result.extractedFields.tax != null ||
            result.extractedFields.total != null) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Extracted Financial Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {result.extractedFields.subtotal != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Extracted Subtotal</span>
                      <span className="font-mono">
                        {result.extractedFields.subtotal.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {result.extractedFields.tax != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Extracted Tax / VAT</span>
                      <span className="font-mono">{result.extractedFields.tax.toFixed(2)}</span>
                    </div>
                  )}
                  {result.extractedFields.discount != null &&
                    result.extractedFields.discount > 0 && (
                      <div className="flex justify-between text-yellow-600">
                        <span>Extracted Discount</span>
                        <span className="font-mono">
                          -{result.extractedFields.discount.toFixed(2)}
                        </span>
                      </div>
                    )}
                  {result.extractedFields.total != null && (
                    <div className="flex justify-between font-medium border-t pt-1 mt-1">
                      <span>Extracted Total</span>
                      <span className="font-mono">{result.extractedFields.total.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

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

          {/* Unresolved tax rates — never defaulted to 0% */}
          {unresolvedTaxLines.length > 0 && (
            <Card className="border-yellow-500" data-testid="unresolved-tax">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm text-yellow-700">
                  <AlertTriangle className="h-4 w-4" />
                  Tax rate needs review
                </CardTitle>
                <CardDescription>
                  The tax rate (%) could not be determined exactly from the document for these
                  lines. Enter the correct tax % in the form (use 0 only if the line is untaxed).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="space-y-1">
                  {unresolvedTaxLines.map((line) => (
                    <li key={line.lineNumber} className="flex justify-between gap-4">
                      <span>
                        Line {line.lineNumber}
                        {line.description ? `: ${line.description}` : ''}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {line.extractedTaxAmount !== null
                          ? `Extracted tax amount: ${line.extractedTaxAmount}`
                          : 'No tax amount found'}
                      </span>
                    </li>
                  ))}
                </ul>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={taxReviewed}
                    onChange={(e) => setTaxReviewed(e.target.checked)}
                    className="h-4 w-4"
                  />
                  I have reviewed the tax % on these lines
                </label>
              </CardContent>
            </Card>
          )}

          {result.validation && <IntakeFieldValidation validation={result.validation} />}

          {/* Bill Form — same as New Bill */}
          <BillForm
            key={scanDefaults.vendorId}
            scanDefaults={scanDefaults}
            onSubmit={handleConfirm}
            onCancel={handleReupload}
            isSubmitting={confirmIntake.isPending}
          />
        </div>
      )}

      {/* Step 4: Confirmed */}
      {step === 'existing' && intake.existingDraft && (
        <Card>
          <CardContent className="py-16">
            <div className="text-center space-y-4">
              <CheckCircle2 className="h-16 w-16 mx-auto text-green-500" />
              <p className="text-lg font-medium">{t('existingDraft')}</p>
              <Button asChild>
                <Link
                  href={
                    intake.existingDraft.type === 'invoice'
                      ? `/sales/invoices/${intake.existingDraft.id}`
                      : `/purchases/bills/${intake.existingDraft.id}`
                  }
                >
                  {t('openDraft')}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
