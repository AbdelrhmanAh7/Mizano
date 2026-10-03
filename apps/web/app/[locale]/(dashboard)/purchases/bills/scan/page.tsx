'use client';

import { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
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
import { format } from 'date-fns';

type Step = 'upload' | 'processing' | 'review' | 'confirmed' | 'existing' | 'empty';

interface UnresolvedTaxLine {
  lineNumber: number;
  description: string;
  extractedTaxAmount: string | null;
}

class InvalidScanDecimal extends Error {}

/** Preserve form strings exactly and enforce Decimal(19,4) before transport. */
function toConfirmDecimal(value: unknown, errorMessage: string): string {
  const match = typeof value === 'string' ? /^(\d+)(?:\.(\d{1,4}))?$/.exec(value.trim()) : null;
  if (!match || match[1].replace(/^0+/, '').length > 15) throw new InvalidScanDecimal(errorMessage);
  return `${match[1].replace(/^0+(?=\d)/, '')}.${(match[2] ?? '').padEnd(4, '0')}`;
}

function ScanLoading() {
  const t = useTranslations('ai.intake');
  return <p role="status">{t('jobLoading')}</p>;
}

export default function ScanBillPage() {
  return (
    <Suspense fallback={<ScanLoading />}>
      <ScanBillRoute />
    </Suspense>
  );
}

function ScanBillRoute() {
  const searchParams = useSearchParams();
  const linkedJobId = searchParams.get('jobId')?.trim() || null;
  const locale = useLocale();
  // Remount before rendering a different job: no previous form or pending mutation survives.
  return <ScanBillContent key={`${locale}:${linkedJobId ?? ''}`} linkedJobId={linkedJobId} />;
}

function ScanBillContent({ linkedJobId }: { linkedJobId: string | null }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('ai.intake');

  const [step, setStep] = useState<Step>(linkedJobId ? 'processing' : 'upload');
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
  const activeRef = useRef(true);
  const redirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      if (redirectRef.current) clearTimeout(redirectRef.current);
    };
  }, []);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  // SSE-based document intake
  const intake = useDocumentIntakeStream();
  const confirmIntake = useDocumentIntakeConfirm();
  const createVendor = useCreateVendor();

  const { loadJob, reset } = intake;
  useEffect(() => {
    setLocalResult(null);
    setScanDefaults(null);
    setLocalError(null);
    setUnresolvedTaxLines([]);
    setTaxReviewed(false);
    if (linkedJobId) {
      setStep('processing');
      void loadJob(linkedJobId);
    } else {
      reset();
      setStep('upload');
    }
    return reset;
  }, [linkedJobId, loadJob, reset]);

  // Transition to review when SSE completes
  useEffect(() => {
    if (intake.result && step === 'processing' && (!linkedJobId || intake.jobId === linkedJobId)) {
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
  }, [intake.result, intake.jobId, linkedJobId, step]);

  // An identical file was already approved: show its draft instead of a review form.
  useEffect(() => {
    if (
      intake.existingDraft &&
      step === 'processing' &&
      (!linkedJobId || intake.jobId === linkedJobId)
    )
      setStep('existing');
  }, [intake.existingDraft, intake.jobId, linkedJobId, step]);

  // Handle errors
  useEffect(() => {
    if (intake.error && step === 'processing' && (!linkedJobId || intake.jobId === linkedJobId)) {
      setLocalError(intake.error);
      setStep('upload');
    }
  }, [intake.error, intake.jobId, linkedJobId, step]);

  useEffect(() => {
    if (intake.isEmpty && step === 'processing' && (!linkedJobId || intake.jobId === linkedJobId)) {
      setStep('empty');
    }
  }, [intake.isEmpty, intake.jobId, linkedJobId, step]);

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (file.size > 15 * 1024 * 1024) {
        setLocalError(t('fileTooLarge'));
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
          if (!activeRef.current) return;
          const blob = Array.isArray(converted) ? converted[0] : converted;
          const jpegFile = new File([blob], file.name.replace(/\.hei[cf]$/i, '.jpg'), {
            type: 'image/jpeg',
          });
          setSelectedFile(jpegFile);
          setPreviewUrl(URL.createObjectURL(jpegFile));
        } catch {
          if (!activeRef.current) return;
          setLocalError(t('conversionFailed'));
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
    [t],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleFileSelect(file);
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
      setLocalError(t('taxReviewRequired'));
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
        quantity: toConfirmDecimal(l.quantity, t('invalidLineDecimal', { line: i + 1 })),
        rate: toConfirmDecimal(l.rate, t('invalidLineDecimal', { line: i + 1 })),
        // The form field is a PERCENTAGE; reviewed lines send it explicitly.
        taxRatePercent: toConfirmDecimal(l.taxRate, t('invalidLineDecimal', { line: i + 1 })),
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

      if (!activeRef.current) return;
      setStep('confirmed');
      redirectRef.current = setTimeout(() => {
        router.push(`/${locale}/purchases/bills/${encodeURIComponent(response.data.id)}`);
      }, 2000);
    } catch (err) {
      if (!activeRef.current) return;
      setLocalError(err instanceof InvalidScanDecimal ? err.message : t('confirmFailed'));
    }
  };

  const handleReupload = () => {
    if (linkedJobId) router.replace(`/${locale}/purchases/bills/scan`);
    setStep('upload');
    setLocalResult(null);
    setScanDefaults(null);
    setLocalError(null);
    setUnresolvedTaxLines([]);
    setTaxReviewed(false);
    intake.reset();
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) return <Badge variant="default">{t('confidenceHigh')}</Badge>;
    if (confidence >= 0.5) return <Badge variant="secondary">{t('confidenceMedium')}</Badge>;
    return <Badge variant="destructive">{t('confidenceLow')}</Badge>;
  };

  // Stage-specific messages for the processing UI
  const stageMessage =
    intake.message ||
    (intake.stage === 'received'
      ? t('stages.received')
      : intake.stage === 'extracting'
        ? t('stages.extracting')
        : intake.stage === 'classifying'
          ? t('stages.classifying')
          : intake.stage === 'matching'
            ? t('stages.matching')
            : t('stages.processing'));

  const result = localResult;
  const error = localError;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
          <Link href={`/${locale}/purchases/bills`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        <StepBadge
          step={1}
          label={t('steps.upload')}
          active={step === 'upload'}
          done={step !== 'upload'}
        />
        <Separator className="w-8" />
        <StepBadge
          step={2}
          label={t('steps.processing')}
          active={step === 'processing'}
          done={step === 'review' || step === 'confirmed'}
        />
        <Separator className="w-8" />
        <StepBadge
          step={3}
          label={t('steps.review')}
          active={step === 'review'}
          done={step === 'confirmed'}
        />
        <Separator className="w-8" />
        <StepBadge step={4} label={t('steps.done')} active={step === 'confirmed'} done={false} />
      </div>

      {/* Error */}
      {error && (
        <Card className="border-destructive" role="alert">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <p>{error}</p>
              {intake.jobStatus && (
                <Badge variant="destructive" data-testid="intake-job-status">
                  {t(`status.${intake.jobStatus}`)}
                </Badge>
              )}
              {(intake.canRetry || linkedJobId) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLocalError(null);
                    setStep('processing');
                    if (intake.canRetry) void intake.retry();
                    else if (linkedJobId) void intake.loadJob(linkedJobId);
                  }}
                >
                  {t('retry')}
                </Button>
              )}
              {!linkedJobId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="ms-auto h-6 w-6"
                  aria-label={t('dismissError')}
                  onClick={() => setLocalError(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'empty' && (
        <Card role="status">
          <CardContent className="space-y-4 pt-6">
            <p>{t('jobEmpty')}</p>
            <Button
              variant="outline"
              onClick={() => {
                setStep('processing');
                if (intake.jobId) void loadJob(intake.jobId);
              }}
            >
              {t('retry')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && !linkedJobId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              {t('uploadTitle')}
            </CardTitle>
            <CardDescription>{t('uploadDescription')}</CardDescription>
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
                  if (file) void handleFileSelect(file);
                };
                input.click();
              }}
            >
              {converting ? (
                <div className="space-y-3">
                  <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
                  <div>
                    <p className="font-medium">{t('converting')}</p>
                    <p className="text-sm text-muted-foreground">{t('conversionHint')}</p>
                  </div>
                </div>
              ) : selectedFile ? (
                <div className="space-y-3">
                  {previewUrl ? (
                    // Blob previews require a native image; Next image optimization cannot fetch them.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt={t('preview')}
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
                    <X className="me-1 h-3 w-3" />
                    {t('remove')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <p className="font-medium">{t('dropHint')}</p>
                    <p className="text-sm text-muted-foreground">{t('formatsHint')}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Scan Mode Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">{t('scanMode')}</span>
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
                    {t('fast')}
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
                    {t('detailed')}
                  </button>
                </div>
              </div>
              <Button onClick={handleProcess} disabled={!selectedFile || converting} size="lg">
                <Sparkles className="me-2 h-4 w-4" />
                {t('process')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {scanMode === 'fast' ? t('fastHint') : t('detailedHint')}
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
                <p className="text-sm text-muted-foreground">{t('processingHint')}</p>
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
                    {t('reconnecting')}
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
                  {t('resultsTitle')}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {result.extractionMethod && (
                    <Badge variant="outline">{result.extractionMethod}</Badge>
                  )}
                  {getConfidenceBadge(result.ocrConfidence)}
                  <span className="text-xs text-muted-foreground">
                    {t('classification', {
                      percent: Math.round(result.classificationConfidence * 100),
                    })}
                  </span>
                </div>
              </div>
              <CardDescription>{t('reviewHint')}</CardDescription>
            </CardHeader>
          </Card>

          {/* Duplicate Warning */}
          {result.duplicateWarning?.isDuplicate && (
            <Card className="border-yellow-500">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="h-5 w-5" />
                  <div>
                    <p className="font-medium">{t('possibleDuplicate')}</p>
                    <p className="text-sm">
                      {t('duplicateMatch', {
                        percent: Math.round((result.duplicateWarning.similarity || 0) * 100),
                      })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Vendor matching */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('vendorTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {result.matchedVendor ? (
                <p>
                  <span className="text-muted-foreground">{t('matchedVendor')}</span>{' '}
                  <span className="font-medium">{result.matchedVendor.name}</span>{' '}
                  <span className="text-muted-foreground">
                    {t('vendorConfidence', {
                      percent: Math.round(result.matchedVendor.similarity * 100),
                    })}
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground">{t('noVendor')}</p>
              )}

              {result.vendorCandidates.length > 1 && (
                <p className="text-muted-foreground">
                  {t('otherCandidates')}{' '}
                  {result.vendorCandidates
                    .filter((c) => c.id !== result.matchedVendor?.id)
                    .slice(0, 3)
                    .map((c) => c.name)
                    .join(', ')}
                </p>
              )}

              {result.extractedFields.vendorTaxId && (
                <p>
                  <span className="text-muted-foreground">{t('vendorTaxId')}</span>{' '}
                  {result.extractedFields.vendorTaxId}
                </p>
              )}

              {result.extractedFields.paymentTerms && (
                <p>
                  <span className="text-muted-foreground">{t('paymentTerms')}</span>{' '}
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
                    try {
                      const created = await createVendor.mutateAsync({
                        name: suggestion.name,
                        email: suggestion.email ?? undefined,
                        phone: suggestion.phone ?? undefined,
                        taxId: suggestion.taxId ?? undefined,
                      });
                      if (created?.data?.id) {
                        if (!activeRef.current) return;
                        setScanDefaults((prev) =>
                          prev ? { ...prev, vendorId: created.data.id } : prev,
                        );
                      }
                    } catch {
                      if (activeRef.current) setLocalError(t('vendorCreateFailed'));
                    }
                  }}
                >
                  {createVendor.isPending ? (
                    <Loader2 className="me-2 h-3 w-3 animate-spin" />
                  ) : (
                    <UserPlus className="me-2 h-3 w-3" />
                  )}
                  {t('createVendor', { name: result.suggestCreateVendor.name })}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Extracted financial summary */}
          {(result.extractedFields.subtotal != null ||
            result.extractedFields.tax != null ||
            result.extractedFields.total != null) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {t('financialSummary')} ({result.extractedFields.currency || t('currencyUnknown')}
                  )
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {result.extractedFields.subtotal != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('extractedSubtotal')}</span>
                      <span className="font-mono">
                        {result.extractedFields.subtotal.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {result.extractedFields.tax != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('extractedTax')}</span>
                      <span className="font-mono">{result.extractedFields.tax.toFixed(2)}</span>
                    </div>
                  )}
                  {result.extractedFields.discount != null &&
                    result.extractedFields.discount > 0 && (
                      <div className="flex justify-between text-yellow-600">
                        <span>{t('extractedDiscount')}</span>
                        <span className="font-mono">
                          -{result.extractedFields.discount.toFixed(2)}
                        </span>
                      </div>
                    )}
                  {result.extractedFields.total != null && (
                    <div className="flex justify-between font-medium border-t pt-1 mt-1">
                      <span>{t('extractedTotal')}</span>
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
                <CardTitle className="text-sm">{t('accountingSuggestion')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t('debit')}</span>{' '}
                    {result.accountingEntry.debitAccount || '-'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('credit')}</span>{' '}
                    {result.accountingEntry.creditAccount || '-'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('tax')}</span>{' '}
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
                  {t('taxReviewTitle')}
                </CardTitle>
                <CardDescription>{t('taxReviewHint')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="space-y-1">
                  {unresolvedTaxLines.map((line) => (
                    <li key={line.lineNumber} className="flex justify-between gap-4">
                      <span>
                        {t('lineNumber', { line: line.lineNumber })}
                        {line.description ? `: ${line.description}` : ''}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {line.extractedTaxAmount !== null
                          ? t('extractedTaxAmount', { amount: line.extractedTaxAmount })
                          : t('noTaxAmount')}
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
                  {t('taxReviewed')}
                </label>
              </CardContent>
            </Card>
          )}

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
                      ? `/${locale}/sales/invoices/${encodeURIComponent(intake.existingDraft.id)}`
                      : `/${locale}/purchases/bills/${encodeURIComponent(intake.existingDraft.id)}`
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
                <p className="text-lg font-medium">{t('confirmed')}</p>
                <p className="text-sm text-muted-foreground">{t('redirecting')}</p>
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
