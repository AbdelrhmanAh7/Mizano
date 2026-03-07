'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  Loader2,
  AlertTriangle,
  Check,
  X,
  FileText,
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Sparkles,
  GraduationCap,
  ShieldCheck,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ConfidenceBadge } from '@/components/ai/confidence-badge';
import { AccountingEntryPreview } from '@/components/ai/accounting-entry-preview';
import { useToast } from '@/components/ui/use-toast';
import {
  useDocumentIntakeProcess,
  useDocumentIntakeConfirm,
  DocumentIntakeResult,
  ConfirmIntakeData,
} from '@/lib/hooks/use-ai';
import { useVendors, useCreateVendor } from '@/lib/hooks/use-vendors';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { QuickTrainDialog } from '@/components/ai/ocr-training/quick-train-dialog';

type Step = 'upload' | 'review' | 'creating';

interface EditableLineItem {
  description: string;
  quantity: string;
  rate: string;
  taxRate: string;
}

export default function ScanBillPage() {
  const router = useRouter();
  const t = useTranslations('purchases');
  const tCommon = useTranslations('common');
  const { toast } = useToast();

  // State
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [intakeResult, setIntakeResult] = useState<DocumentIntakeResult | null>(null);

  // Editable review fields
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [date, setDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<EditableLineItem[]>([]);
  const [corrections, setCorrections] = useState<Record<string, unknown>>({});
  const [showTrainDialog, setShowTrainDialog] = useState(false);
  const [showCreateVendor, setShowCreateVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorDisplayName, setNewVendorDisplayName] = useState('');

  // Mutations
  const processDocument = useDocumentIntakeProcess();
  const confirmIntake = useDocumentIntakeConfirm();

  // Vendors list for dropdown
  const { data: vendorsData } = useVendors();
  const vendors = vendorsData?.data || [];
  const createVendor = useCreateVendor();

  // ---------------------------------------------------------------------------
  // File upload
  // ---------------------------------------------------------------------------

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);
      if (selectedFile.type.startsWith('image/')) {
        setPreview(URL.createObjectURL(selectedFile));
      } else {
        setPreview(null); // PDFs won't have a preview
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp', '.tiff', '.heic', '.heif'],
      'application/pdf': ['.pdf'],
    },
    maxSize: 15 * 1024 * 1024, // 15MB
    multiple: false,
  });

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setIntakeResult(null);
    setStep('upload');
  };

  // ---------------------------------------------------------------------------
  // Process document
  // ---------------------------------------------------------------------------

  const handleProcess = () => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    processDocument.mutate(formData, {
      onSuccess: (response) => {
        const result: DocumentIntakeResult = response.data;
        setIntakeResult(result);

        // Pre-fill editable fields from extraction
        setSelectedVendorId(result.matchedVendor?.id || '');
        setDocumentNumber(result.extractedFields.documentNumber || '');
        setDate(result.extractedFields.date || new Date().toISOString().split('T')[0]);
        setDueDate(result.extractedFields.dueDate || '');
        setNotes('');
        setCorrections({});

        // Compute effective tax rate % from extracted tax and subtotal
        const extractedTax = result.extractedFields.tax;
        const extractedSubtotal = result.extractedFields.subtotal;
        let effectiveTaxRate = 0;
        if (extractedTax && extractedSubtotal && extractedSubtotal > 0) {
          effectiveTaxRate = Math.round((extractedTax / extractedSubtotal) * 100 * 100) / 100;
        }

        // Convert line items to editable format
        const lineItemsArr = Array.isArray(result.extractedFields.lineItems)
          ? result.extractedFields.lineItems
          : [];
        if (lineItemsArr.length > 0) {
          setLineItems(
            lineItemsArr.map((item) => ({
              description: item.description,
              quantity: String(item.quantity),
              rate: String(item.unitPrice),
              taxRate: String(effectiveTaxRate),
            })),
          );
        } else {
          // If no line items extracted, add a default line with the subtotal
          setLineItems([
            {
              description: 'Scanned item',
              quantity: '1',
              rate: String(extractedSubtotal || result.extractedFields.total || 0),
              taxRate: String(effectiveTaxRate),
            },
          ]);
        }

        setStep('review');
        const methodLabel =
          result.extractionMethod === 'vlm'
            ? 'VLM'
            : result.extractionMethod === 'paddleocr+tesseract'
              ? 'PaddleOCR + Tesseract'
              : 'OCR';
        toast({
          title: 'Document processed',
          description: `Classified as ${result.documentType} with ${Math.round(result.ocrConfidence * 100)}% confidence (${methodLabel})`,
        });
      },
      onError: (error: unknown) => {
        const err = error as { response?: { data?: { message?: string } } };
        toast({
          variant: 'destructive',
          title: 'Processing failed',
          description: err.response?.data?.message || 'Failed to process document',
        });
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Confirm and create bill
  // ---------------------------------------------------------------------------

  const handleConfirm = () => {
    if (!selectedVendorId) {
      toast({
        variant: 'destructive',
        title: 'Vendor required',
        description: 'Please select a vendor before creating the bill.',
      });
      return;
    }

    if (lineItems.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Line items required',
        description: 'Please add at least one line item.',
      });
      return;
    }

    setStep('creating');

    const data: ConfirmIntakeData = {
      type: 'BILL',
      vendorId: selectedVendorId,
      date: date || new Date().toISOString().split('T')[0],
      dueDate: dueDate || date || new Date().toISOString().split('T')[0],
      documentNumber: documentNumber || undefined,
      lines: lineItems.map((item) => ({
        description: item.description,
        quantity: parseFloat(item.quantity) || 1,
        rate: parseFloat(item.rate) || 0,
        taxRate: parseFloat(item.taxRate) || 0,
      })),
      notes: notes || undefined,
      corrections: {
        ...(Object.keys(corrections).length > 0 ? corrections : {}),
        // VLM feedback metadata
        _extractionMethod: intakeResult?.extractionMethod,
        _originalExtraction: {
          vendorName: intakeResult?.extractedFields.vendorName ?? null,
          invoiceNumber: intakeResult?.extractedFields.documentNumber ?? null,
          date: intakeResult?.extractedFields.date ?? null,
          dueDate: intakeResult?.extractedFields.dueDate ?? null,
          total: intakeResult?.extractedFields.total ?? null,
          subtotal: intakeResult?.extractedFields.subtotal ?? null,
          tax: intakeResult?.extractedFields.tax ?? null,
          lineItemCount: intakeResult?.extractedFields.lineItems?.length || 0,
        },
        _fieldConfidence: intakeResult?.fieldConfidence,
        _accountingEntryAccepted: intakeResult?.accountingEntry != null,
        // Python OCR service metadata
        _detailedConfidence: intakeResult?.detailedConfidence ?? null,
        _validationResults: intakeResult?.validationResults ?? null,
      },
    };

    confirmIntake.mutate(data, {
      onSuccess: (response) => {
        const result = response.data;
        toast({
          title: 'Bill created',
          description: `Draft bill ${result.number} created successfully.`,
        });
        router.push(`/purchases/bills/${result.id}`);
      },
      onError: (error: unknown) => {
        const err = error as { response?: { data?: { message?: string } } };
        setStep('review');
        toast({
          variant: 'destructive',
          title: 'Creation failed',
          description: err.response?.data?.message || 'Failed to create bill',
        });
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Line item helpers
  // ---------------------------------------------------------------------------

  const addLineItem = () => {
    setLineItems((prev) => [...prev, { description: '', quantity: '1', rate: '0', taxRate: '0' }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Track corrections for vendor layout learning
  const trackCorrection = (field: string, originalValue: unknown, newValue: unknown) => {
    if (String(originalValue ?? '') !== String(newValue ?? '')) {
      setCorrections((prev) => ({ ...prev, [field]: newValue }));
    } else {
      // Remove correction if reverted back to original
      setCorrections((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleOpenCreateVendor = () => {
    setNewVendorName(intakeResult?.extractedFields.vendorName || '');
    setNewVendorDisplayName('');
    setShowCreateVendor(true);
  };

  const handleCreateVendor = () => {
    if (!newVendorName.trim()) return;
    createVendor.mutate(
      { name: newVendorName.trim(), displayName: newVendorDisplayName.trim() || null },
      {
        onSuccess: (data: unknown) => {
          const d = data as { id?: string; data?: { id?: string } };
          const vendorId = d?.id || d?.data?.id;
          if (vendorId) {
            setSelectedVendorId(vendorId);
          }
          setShowCreateVendor(false);
        },
      },
    );
  };

  const updateLineItem = (index: number, field: keyof EditableLineItem, value: string) => {
    setLineItems((prev) => {
      const updated = prev.map((item, i) => (i === index ? { ...item, [field]: value } : item));

      // Track total/subtotal/tax corrections when line items change
      if (intakeResult && (field === 'quantity' || field === 'rate' || field === 'taxRate')) {
        const newSubtotal = updated.reduce(
          (sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0),
          0,
        );
        const newTax = updated.reduce((sum, item) => {
          const lt = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
          return sum + lt * ((parseFloat(item.taxRate) || 0) / 100);
        }, 0);
        const newTotal = newSubtotal + newTax;

        // Compare computed values against AI-extracted values
        if (intakeResult.extractedFields.subtotal !== null) {
          trackCorrection('subtotal', intakeResult.extractedFields.subtotal, newSubtotal);
        }
        if (intakeResult.extractedFields.tax !== null) {
          trackCorrection('tax', intakeResult.extractedFields.tax, newTax);
        }
        if (intakeResult.extractedFields.total !== null) {
          trackCorrection('total', intakeResult.extractedFields.total, newTotal);
        }
      }

      return updated;
    });
  };

  // Calculate totals
  const subtotal = lineItems.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
  }, 0);

  const taxTotal = lineItems.reduce((sum, item) => {
    const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
    return sum + lineTotal * ((parseFloat(item.taxRate) || 0) / 100);
  }, 0);

  const grandTotal = subtotal + taxTotal;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/purchases/bills">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {tCommon('buttons.back')}
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Scan & Create Bill
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload an invoice image or PDF to automatically extract data and create a bill
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        <Badge variant={step === 'upload' ? 'default' : 'secondary'}>1. Upload</Badge>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <Badge variant={step === 'review' ? 'default' : 'secondary'}>2. Review & Edit</Badge>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <Badge variant={step === 'creating' ? 'default' : 'secondary'}>3. Create Bill</Badge>
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upload Document</CardTitle>
            </CardHeader>
            <CardContent>
              {!file ? (
                <div
                  {...getRootProps()}
                  className={cn(
                    'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors',
                    isDragActive
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-primary/50',
                  )}
                >
                  <input {...getInputProps()} />
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-base font-medium">
                    {isDragActive ? 'Drop the file here...' : 'Drag & drop an invoice or bill'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    or click to browse (JPEG, PNG, PDF up to 15MB)
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {preview ? (
                    <div className="relative aspect-[4/3] bg-muted rounded-lg overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview}
                        alt="Document preview"
                        className="w-full h-full object-contain"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={clearFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="relative flex flex-col items-center justify-center aspect-[4/3] bg-muted rounded-lg">
                      <FileText className="h-16 w-16 text-muted-foreground mb-2" />
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={clearFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <Button
                    onClick={handleProcess}
                    disabled={processDocument.isPending}
                    className="w-full"
                    size="lg"
                  >
                    {processDocument.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        AI is analyzing your invoice...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Extract Data with AI
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">How it works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                  1
                </div>
                <div>
                  <p className="font-medium">Upload</p>
                  <p className="text-sm text-muted-foreground">
                    Upload an invoice image or PDF document
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                  2
                </div>
                <div>
                  <p className="font-medium">AI Extraction</p>
                  <p className="text-sm text-muted-foreground">
                    AI reads the document and extracts vendor, date, amounts, and line items
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                  3
                </div>
                <div>
                  <p className="font-medium">Review & Correct</p>
                  <p className="text-sm text-muted-foreground">
                    Review extracted data, fix any mistakes, select the correct vendor
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                  4
                </div>
                <div>
                  <p className="font-medium">Create Bill</p>
                  <p className="text-sm text-muted-foreground">
                    One click to create a draft bill. AI learns from your corrections.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: Review */}
      {step === 'review' && intakeResult && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Document preview */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                Document
                <div className="flex items-center gap-2">
                  <ConfidenceBadge confidence={intakeResult.ocrConfidence} size="sm" />
                  <ExtractionMethodBadge method={intakeResult.extractionMethod} />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {preview ? (
                <div className="aspect-[3/4] bg-muted rounded-lg overflow-hidden mb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Document" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center aspect-[3/4] bg-muted rounded-lg mb-4">
                  <FileText className="h-16 w-16 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">{file?.name}</p>
                </div>
              )}

              {/* Classification result */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <Badge variant="outline">{intakeResult.documentType}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Classification</span>
                  <span>{Math.round(intakeResult.classificationConfidence * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">OCR Confidence</span>
                  <span>{Math.round(intakeResult.ocrConfidence * 100)}%</span>
                </div>
              </div>

              {/* Detailed confidence breakdown (from Python OCR service) */}
              {intakeResult.detailedConfidence && (
                <DetailedConfidencePanel confidence={intakeResult.detailedConfidence} />
              )}

              {/* Validation results (from Python OCR service) */}
              {intakeResult.validationResults && (
                <ValidationResultsPanel validation={intakeResult.validationResults} />
              )}
            </CardContent>
          </Card>

          {/* Right: Editable fields */}
          <div className="lg:col-span-2 space-y-6">
            {/* Duplicate warning */}
            {intakeResult.duplicateWarning?.isDuplicate && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Possible Duplicate</AlertTitle>
                <AlertDescription>
                  This document may already exist in the system (
                  {intakeResult.duplicateWarning.matchType} match,{' '}
                  {Math.round(intakeResult.duplicateWarning.similarity * 100)}% similarity). Please
                  verify before creating.
                </AlertDescription>
              </Alert>
            )}

            {/* Bill details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('bills.billDetails')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Vendor */}
                <div className="space-y-2">
                  <Label>
                    {t('bills.form.vendor')} *
                    {intakeResult.matchedVendor && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        AI suggested: {Math.round(intakeResult.matchedVendor.similarity * 100)}%
                        match
                      </Badge>
                    )}
                  </Label>
                  <Select
                    value={selectedVendorId}
                    onValueChange={(value) => {
                      setSelectedVendorId(value);
                      // Track vendor name correction (use display name, not ID)
                      const selectedVendor =
                        intakeResult.vendorCandidates.find((c) => c.id === value) ||
                        vendors.find(
                          (v: { id: string; displayName?: string | null; name: string }) =>
                            v.id === value,
                        );
                      const selectedName =
                        selectedVendor?.displayName || selectedVendor?.name || value;
                      trackCorrection(
                        'vendorName',
                        intakeResult.extractedFields.vendorName,
                        selectedName,
                      );
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Show AI candidates first */}
                      {intakeResult.vendorCandidates.length > 0 && (
                        <>
                          {intakeResult.vendorCandidates.map((candidate) => (
                            <SelectItem key={`ai-${candidate.id}`} value={candidate.id}>
                              {candidate.name} ({Math.round(candidate.similarity * 100)}% match)
                            </SelectItem>
                          ))}
                          <Separator className="my-1" />
                        </>
                      )}
                      {/* Show all vendors */}
                      {vendors.map(
                        (vendor: { id: string; displayName?: string | null; name: string }) => (
                          <SelectItem key={vendor.id} value={vendor.id}>
                            {vendor.displayName || vendor.name}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    {intakeResult.extractedFields.vendorName && (
                      <p className="text-xs text-muted-foreground flex-1">
                        Detected vendor name: &quot;{intakeResult.extractedFields.vendorName}&quot;
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={handleOpenCreateVendor}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      New vendor
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Document Number */}
                  <div className="space-y-2">
                    <Label>
                      {t('bills.form.billNumber')}
                      <FieldConfidence confidence={intakeResult.fieldConfidence?.invoiceNumber} />
                    </Label>
                    <Input
                      value={documentNumber}
                      onChange={(e) => {
                        setDocumentNumber(e.target.value);
                        trackCorrection(
                          'invoiceNumber',
                          intakeResult.extractedFields.documentNumber,
                          e.target.value,
                        );
                      }}
                      placeholder="Auto-generated if empty"
                    />
                  </div>

                  {/* Date */}
                  <div className="space-y-2">
                    <Label>
                      {t('bills.form.date')} *
                      <FieldConfidence confidence={intakeResult.fieldConfidence?.date} />
                    </Label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value);
                        trackCorrection('date', intakeResult.extractedFields.date, e.target.value);
                      }}
                    />
                  </div>

                  {/* Due Date */}
                  <div className="space-y-2">
                    <Label>{t('bills.form.dueDate')} *</Label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>{t('bills.form.notes')}</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes..."
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Line items */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>
                    {t('lineItems.title')}
                    <FieldConfidence confidence={intakeResult.fieldConfidence?.lineItems} />
                  </span>
                  <Button variant="outline" size="sm" onClick={addLineItem}>
                    <Plus className="h-4 w-4 mr-1" />
                    {t('lineItems.addItem')}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">{t('lineItems.description')}</TableHead>
                      <TableHead>{t('lineItems.quantity')}</TableHead>
                      <TableHead>{t('lineItems.rate')}</TableHead>
                      <TableHead>{t('lineItems.tax')} %</TableHead>
                      <TableHead className="text-right">{t('lineItems.amount')}</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((item, index) => {
                      const lineTotal =
                        (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
                      const isLowConfidence =
                        intakeResult.detailedConfidence &&
                        intakeResult.detailedConfidence.line_items < 80;
                      return (
                        <TableRow
                          key={index}
                          className={isLowConfidence ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}
                        >
                          <TableCell>
                            <Input
                              value={item.description}
                              onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                              placeholder="Description"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                              className="w-20"
                              min="0"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.rate}
                              onChange={(e) => updateLineItem(index, 'rate', e.target.value)}
                              className="w-28"
                              min="0"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.taxRate}
                              onChange={(e) => updateLineItem(index, 'taxRate', e.target.value)}
                              className="w-20"
                              min="0"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {lineTotal.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {lineItems.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeLineItem(index)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Totals */}
                <div className="flex justify-end mt-4">
                  <div className="w-64 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{tCommon('subtotal')}</span>
                      <span className="font-medium">{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{tCommon('tax')}</span>
                      <span className="font-medium">{taxTotal.toFixed(2)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-base">
                      <span className="font-semibold">{tCommon('total')}</span>
                      <span className="font-bold">{grandTotal.toFixed(2)}</span>
                    </div>
                    {intakeResult.extractedFields.total && (
                      <p className="text-xs text-muted-foreground text-right">
                        AI extracted total: {intakeResult.extractedFields.total.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Accounting Entry Suggestion (from VLM) */}
            {intakeResult?.accountingEntry && (
              <AccountingEntryPreview
                entry={intakeResult.accountingEntry}
                subtotal={lineItems.reduce(
                  (sum, item) =>
                    sum + (parseFloat(item.rate) || 0) * (parseFloat(item.quantity) || 0),
                  0,
                )}
                taxAmount={intakeResult.extractedFields.tax || 0}
                totalAmount={intakeResult.extractedFields.total || 0}
              />
            )}

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep('upload')}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Upload
              </Button>

              <div className="flex items-center gap-2">
                {Object.keys(corrections).length > 0 && (
                  <>
                    <Badge variant="secondary">
                      {Object.keys(corrections).length} correction(s) — AI will learn
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => setShowTrainDialog(true)}>
                      <GraduationCap className="h-4 w-4 mr-1" />
                      Train OCR
                    </Button>
                  </>
                )}
                <Button
                  onClick={handleConfirm}
                  disabled={confirmIntake.isPending || !selectedVendorId}
                  size="lg"
                >
                  {confirmIntake.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {tCommon('loading.creating')}
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      {t('bills.newBill')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Creating */}
      {step === 'creating' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">Creating your bill...</p>
            <p className="text-sm text-muted-foreground">This will only take a moment</p>
          </CardContent>
        </Card>
      )}

      {/* Quick Train Dialog */}
      <QuickTrainDialog
        open={showTrainDialog}
        onOpenChange={setShowTrainDialog}
        extractionResult={
          intakeResult
            ? {
                date: intakeResult.extractedFields.date,
                total: intakeResult.extractedFields.total,
                subtotal: intakeResult.extractedFields.subtotal ?? null,
                tax: intakeResult.extractedFields.tax ?? null,
                invoiceNumber: intakeResult.extractedFields.documentNumber,
                vendorName: intakeResult.extractedFields.vendorName,
                lineItems: intakeResult.extractedFields.lineItems,
                ocrConfidence: intakeResult.ocrConfidence,
                rawText: intakeResult.rawText,
                fieldConfidence: intakeResult.fieldConfidence,
              }
            : undefined
        }
        vendorId={selectedVendorId}
        corrections={corrections}
      />

      {/* Create Vendor Dialog */}
      <Dialog open={showCreateVendor} onOpenChange={setShowCreateVendor}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Vendor</DialogTitle>
            <DialogDescription>
              Add a new vendor from the detected name on the scanned document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('vendors.form.name')} *</Label>
              <Input
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                placeholder="Company name"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('vendors.form.displayName')}</Label>
              <Input
                value={newVendorDisplayName}
                onChange={(e) => setNewVendorDisplayName(e.target.value)}
                placeholder="Optional short name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateVendor(false)}>
              {tCommon('buttons.cancel')}
            </Button>
            <Button
              onClick={handleCreateVendor}
              disabled={!newVendorName.trim() || createVendor.isPending}
            >
              {createVendor.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {tCommon('buttons.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helper component for per-field confidence indicator
// ---------------------------------------------------------------------------

function FieldConfidence({ confidence }: { confidence?: number }) {
  if (confidence === undefined || confidence === null) return null;
  if (confidence === 0) return null;

  const pct = Math.round(confidence * 100);
  const color =
    confidence >= 0.8 ? 'text-green-600' : confidence >= 0.6 ? 'text-yellow-600' : 'text-red-600';

  return <span className={cn('ml-1 text-xs font-normal', color)}>({pct}%)</span>;
}

// ---------------------------------------------------------------------------
// Extraction method badge
// ---------------------------------------------------------------------------

function ExtractionMethodBadge({ method }: { method?: string }) {
  if (method === 'vlm') {
    return (
      <Badge variant="default" className="text-xs">
        VLM
      </Badge>
    );
  }
  if (method === 'paddleocr+tesseract') {
    return (
      <Badge variant="default" className="text-xs bg-blue-600 hover:bg-blue-700">
        PaddleOCR + Tesseract
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs">
      OCR
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Detailed confidence breakdown panel
// ---------------------------------------------------------------------------

function DetailedConfidencePanel({
  confidence,
}: {
  confidence: {
    overall: number;
    invoice_number: number;
    dates: number;
    vendor: number;
    line_items: number;
    totals: number;
  };
}) {
  const fields = [
    { label: 'Invoice #', value: confidence.invoice_number },
    { label: 'Dates', value: confidence.dates },
    { label: 'Vendor', value: confidence.vendor },
    { label: 'Line Items', value: confidence.line_items },
    { label: 'Totals', value: confidence.totals },
  ];

  return (
    <div className="mt-4 space-y-2">
      <Separator />
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <Info className="h-3 w-3" />
        Field Confidence
      </p>
      <div className="space-y-1.5">
        {fields.map(({ label, value }) => {
          const pct = Math.round(value);
          const barColor =
            pct >= 80
              ? 'bg-green-500'
              : pct >= 60
                ? 'bg-yellow-500'
                : pct >= 30
                  ? 'bg-orange-500'
                  : 'bg-red-500';
          return (
            <div key={label} className="flex items-center gap-2 text-xs">
              <span className="w-20 text-muted-foreground truncate">{label}</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', barColor)}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 text-right tabular-nums">{pct}%</span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs font-medium pt-1">
        <span>Overall</span>
        <span>{Math.round(confidence.overall)}%</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation results panel
// ---------------------------------------------------------------------------

function ValidationResultsPanel({
  validation,
}: {
  validation: {
    all_passed: boolean;
    checks: Array<{ name: string; passed: boolean; detail: string }>;
    corrections_applied: string[];
  };
}) {
  const passedCount = validation.checks.filter((c) => c.passed).length;
  const failedCount = validation.checks.filter((c) => !c.passed).length;

  return (
    <div className="mt-4 space-y-2">
      <Separator />
      <div className="flex items-center gap-1.5 text-xs font-medium">
        {validation.all_passed ? (
          <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <ShieldAlert className="h-3.5 w-3.5 text-yellow-600" />
        )}
        <span className={validation.all_passed ? 'text-green-600' : 'text-yellow-600'}>
          Math Validation: {passedCount} passed{failedCount > 0 ? `, ${failedCount} failed` : ''}
        </span>
      </div>

      {/* Show failed checks */}
      {failedCount > 0 && (
        <div className="space-y-1">
          {validation.checks
            .filter((c) => !c.passed)
            .map((check, i) => (
              <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400 pl-5">
                {check.detail}
              </p>
            ))}
        </div>
      )}

      {/* Auto-corrections applied */}
      {validation.corrections_applied.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 pl-5">
            Auto-corrections applied:
          </p>
          {validation.corrections_applied.map((correction, i) => (
            <p key={i} className="text-xs text-blue-600 dark:text-blue-400 pl-5">
              {correction}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
