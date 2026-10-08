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
import { cn } from '@/lib/utils';
import { getScanReviewErrorMessage } from '@/lib/scan-review-error';
import { format } from 'date-fns';

type Step = 'upload' | 'processing' | 'review' | 'confirmed' | 'existing';

interface UnresolvedTaxLine {
  lineNumber: number;
  description: string;
  extractedTaxAmount: string | null;
}

type ConfirmLineField = 'quantity' | 'rate' | 'taxPercent';

/** Thrown when a reviewed line value is not a non-negative decimal; localized by the page. */
class ConfirmLineValueError extends Error {
  constructor(
    readonly line: number,
    readonly field: ConfirmLineField,
  ) {
    super(`line ${line}: invalid ${field}`);
  }
}

/** BillForm submits decimal strings; validate them before sending them to the API. */
function toConfirmDecimal(value: unknown, field: ConfirmLineField, lineNumber: number): string {
  const text =
    typeof value === 'number' || typeof value === 'string' ? toDecimalString(value) : null;
  if (text === null) throw new ConfirmLineValueError(lineNumber, field);
  return text;
}

export default function ScanBillPage() {
  const router = useRouter();
  const t = useTranslations('ai.intake');
  const ts = useTranslations('ai.intake.scan');

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

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (file.size > 15 * 1024 * 1024) {
        setLocalError(ts('fileTooLarge'));
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
          setLocalError(ts('heicFailed'));
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
    },
    [ts],
  );

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
      setLocalError(ts('taxNotReviewed'));
      return;
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
        taxRatePercent: toConfirmDecimal(l.taxRate, 'taxPercent', i + 1),
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
        err instanceof ConfirmLineValueError
          ? ts('lineValueInvalid', { line: err.line, field: ts(`fields.${err.field}`) })
          : getScanReviewErrorMessage(err, ts('createFailed'), ts('currencyMismatch')),
      );
    }
  };

  const handleReupload = () => {
    setStep('upload');
    setLocalResult(null);
    setScanDefaults(null);
    setLocalError(null);
    setUnresolvedTaxLines([]);
    setTaxReviewed(false);
    intake.reset();
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) return <Badge variant="default">{ts('confidence.high')}</Badge>;
    if (confidence >= 0.5) return <Badge variant="secondary">{ts('confidence.medium')}</Badge>;
    return <Badge variant="destructive">{ts('confidence.low')}</Badge>;
  };

  // Stage-specific messages for the processing UI
  const stageMessage =
    intake.message ||
    (intake.stage === 'received'
      ? ts('stage.received')
      : intake.stage === 'extracting'
        ? ts('stage.extracting')
        : intake.stage === 'classifying'
          ? ts('stage.classifying')
          : intake.stage === 'matching'
            ? ts('stage.matching')
            : ts('stage.processing'));

  const result = localResult;
  const error = localError;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label={ts('back')}>
          <Link href="/purchases/bills">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{ts('title')}</h1>
          <p className="text-muted-foreground">{ts('subtitle')}</p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        <StepBadge
          step={1}
          label={ts('steps.upload')}
          active={step === 'upload'}
          done={step !== 'upload'}
        />
        <Separator className="w-8" />
        <StepBadge
          step={2}
          label={ts('steps.processing')}
          active={step === 'processing'}
          done={step === 'review' || step === 'confirmed'}
        />
        <Separator className="w-8" />
        <StepBadge
          step={3}
          label={ts('steps.review')}
          active={step === 'review'}
          done={step === 'confirmed'}
        />
        <Separator className="w-8" />
        <StepBadge step={4} label={ts('steps.done')} active={step === 'confirmed'} done={false} />
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
                aria-label={ts('dismissError')}
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
              {ts('uploadTitle')}
            </CardTitle>
            <CardDescription>{ts('uploadDescription')}</CardDescription>
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
                    <p className="font-medium">{ts('convertingTitle')}</p>
                    <p className="text-sm text-muted-foreground">{ts('convertingHint')}</p>
                  </div>
                </div>
              ) : selectedFile ? (
                <div className="space-y-3">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt={ts('previewAlt')}
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
                    {ts('remove')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <p className="font-medium">{ts('dropHint')}</p>
                    <p className="text-sm text-muted-foreground">{ts('supportsHint')}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Scan Mode Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">{ts('scanMode')}</span>
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
                    {ts('fast')}
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
                    {ts('accurate')}
                  </button>
                </div>
              </div>
              <Button onClick={handleProcess} disabled={!selectedFile || converting} size="lg">
                <Sparkles className="mr-2 h-4 w-4" />
                {ts('processWithAi')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {scanMode === 'fast' ? ts('fastHint') : ts('accurateHint')}
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
                <p className="text-sm text-muted-foreground">{ts('processingHint')}</p>
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
                    {ts('reconnecting')}
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
                  {ts('resultsTitle')}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {result.extractionMethod && (
                    <Badge variant="outline">{result.extractionMethod}</Badge>
                  )}
                  {getConfidenceBadge(result.ocrConfidence)}
                  <span className="text-xs text-muted-foreground">
                    {ts('classification', {
                      value: Math.round(result.classificationConfidence * 100),
                    })}
                  </span>
                </div>
              </div>
              <CardDescription>{ts('reviewHint')}</CardDescription>
            </CardHeader>
          </Card>

          {/* Duplicate Warning */}
          {result.duplicateWarning?.isDuplicate && (
            <Card className="border-yellow-500">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="h-5 w-5" />
                  <div>
                    <p className="font-medium">{ts('duplicateTitle')}</p>
                    <p className="text-sm">
                      {ts('duplicateBody', {
                        value: Math.round((result.duplicateWarning.similarity || 0) * 100),
                      })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Vendor Intelligence */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{ts('vendorTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {result.matchedVendor ? (
                <p>
                  <span className="text-muted-foreground">{ts('vendorMatched')}</span>{' '}
                  <span className="font-medium">{result.matchedVendor.name}</span>{' '}
                  <span className="text-muted-foreground">
                    {ts('vendorConfidence', {
                      value: Math.round(result.matchedVendor.similarity * 100),
                    })}
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground">{ts('noVendorMatched')}</p>
              )}

              {result.vendorCandidates.length > 1 && (
                <p className="text-muted-foreground">
                  {ts('otherCandidates', {
                    names: result.vendorCandidates
                      .filter((c) => c.id !== result.matchedVendor?.id)
                      .slice(0, 3)
                      .map((c) => c.name)
                      .join(', '),
                  })}
                </p>
              )}

              {result.extractedFields.vendorTaxId && (
                <p>
                  <span className="text-muted-foreground">{ts('vendorTaxId')}</span>{' '}
                  {result.extractedFields.vendorTaxId}
                </p>
              )}

              {result.extractedFields.paymentTerms && (
                <p>
                  <span className="text-muted-foreground">{ts('paymentTerms')}</span>{' '}
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
                  {ts('createVendor', { name: result.suggestCreateVendor.name })}
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
                <CardTitle className="text-sm">{ts('summaryTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {result.extractedFields.subtotal != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{ts('extractedSubtotal')}</span>
                      <span className="font-mono">
                        {Number(result.extractedFields.subtotal).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {result.extractedFields.tax != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{ts('extractedTax')}</span>
                      <span className="font-mono">
                        {Number(result.extractedFields.tax).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {result.extractedFields.discount != null &&
                    Number(result.extractedFields.discount) > 0 && (
                      <div className="flex justify-between text-yellow-600">
                        <span>{ts('extractedDiscount')}</span>
                        <span className="font-mono">
                          -{Number(result.extractedFields.discount).toFixed(2)}
                        </span>
                      </div>
                    )}
                  {result.extractedFields.total != null && (
                    <div className="flex justify-between font-medium border-t pt-1 mt-1">
                      <span>{ts('extractedTotal')}</span>
                      <span className="font-mono">
                        {Number(result.extractedFields.total).toFixed(2)}
                      </span>
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
                <CardTitle className="text-sm">{ts('accountingTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">{ts('debit')}</span>{' '}
                    {result.accountingEntry.debitAccount || '-'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">{ts('credit')}</span>{' '}
                    {result.accountingEntry.creditAccount || '-'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">{ts('tax')}</span>{' '}
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
                  {ts('taxReviewTitle')}
                </CardTitle>
                <CardDescription>{ts('taxReviewBody')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="space-y-1">
                  {unresolvedTaxLines.map((line) => (
                    <li key={line.lineNumber} className="flex justify-between gap-4">
                      <span>
                        {ts('line', { line: line.lineNumber })}
                        {line.description ? `: ${line.description}` : ''}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {line.extractedTaxAmount !== null
                          ? ts('extractedTaxAmount', { amount: line.extractedTaxAmount })
                          : ts('noTaxAmount')}
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
                  {ts('taxReviewedCheckbox')}
                </label>
              </CardContent>
            </Card>
          )}

          {/* Bill Form — same as New Bill */}
          <BillForm
            key={scanDefaults.vendorId}
            scanDefaults={scanDefaults}
            extractedTotals={{
              subtotal: result.extractedFields.subtotal,
              tax: result.extractedFields.tax,
              total: result.extractedFields.total,
              discount: result.extractedFields.discount,
            }}
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
                <p className="text-lg font-medium">{ts('createdTitle')}</p>
                <p className="text-sm text-muted-foreground">{ts('redirecting')}</p>
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
