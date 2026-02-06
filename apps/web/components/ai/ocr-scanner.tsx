'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  Loader2,
  AlertTriangle,
  Check,
  X,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ConfidenceBadge } from './confidence-badge';
import { useOcrExtract, useOcrLearn } from '@/lib/hooks/use-ai';
import { cn } from '@/lib/utils';

export interface OcrExtractedData {
  date: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  invoiceNumber: string | null;
  vendorName: string | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  ocrConfidence: number;
  rawText: string;
}

export interface OcrScannerProps {
  vendorId?: string;
  onExtract?: (data: OcrExtractedData) => void;
  onApply?: (data: OcrExtractedData) => void;
  className?: string;
}

export function OcrScanner({
  vendorId,
  onExtract,
  onApply,
  className,
}: OcrScannerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<OcrExtractedData | null>(null);
  const [editedData, setEditedData] = useState<Partial<OcrExtractedData>>({});
  const [isDuplicateWarning, setIsDuplicateWarning] = useState(false);

  const { mutate: extractOcr, isPending: isExtracting } = useOcrExtract();
  const { mutate: learnOcr, isPending: isLearning } = useOcrLearn();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setExtractedData(null);
      setEditedData({});
      setIsDuplicateWarning(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp', '.tiff'],
      'application/pdf': ['.pdf'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: false,
  });

  const handleExtract = () => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    if (vendorId) {
      formData.append('vendorId', vendorId);
    }

    extractOcr(formData, {
      onSuccess: (response) => {
        const data = response.data;
        setExtractedData(data);
        setEditedData({});
        onExtract?.(data);

        // Check for duplicate warning (this would come from the API)
        if ((response as any).isDuplicate) {
          setIsDuplicateWarning(true);
        }
      },
    });
  };

  const handleFieldChange = (field: keyof OcrExtractedData, value: any) => {
    setEditedData((prev) => ({ ...prev, [field]: value }));
  };

  const getMergedData = (): OcrExtractedData => {
    if (!extractedData) return {} as OcrExtractedData;
    return { ...extractedData, ...editedData };
  };

  const handleApply = () => {
    const mergedData = getMergedData();
    onApply?.(mergedData);
  };

  const handleLearn = () => {
    if (!vendorId || !extractedData) return;

    const corrections: Record<string, any> = {};
    Object.keys(editedData).forEach((key) => {
      if (editedData[key as keyof typeof editedData] !== undefined) {
        corrections[key] = editedData[key as keyof typeof editedData];
      }
    });

    if (Object.keys(corrections).length === 0) return;

    learnOcr(
      { vendorId, ...corrections },
      {
        onSuccess: () => {
          // Show success feedback
        },
      }
    );
  };

  const hasCorrections = Object.keys(editedData).length > 0;

  const isFieldCorrected = (field: keyof OcrExtractedData) => {
    return editedData[field] !== undefined;
  };

  const getFieldValue = (field: keyof OcrExtractedData) => {
    if (editedData[field] !== undefined) return editedData[field];
    return extractedData?.[field] ?? '';
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setExtractedData(null);
    setEditedData({});
    setIsDuplicateWarning(false);
  };

  return (
    <div className={cn('grid gap-4 lg:grid-cols-2', className)}>
      {/* Left: Upload/Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Invoice Image
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!file ? (
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              )}
            >
              <input {...getInputProps()} />
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm font-medium">
                {isDragActive
                  ? 'Drop the file here...'
                  : 'Drag & drop an invoice image'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                or click to browse (JPEG, PNG, PDF up to 10MB)
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative aspect-[4/3] bg-muted rounded-lg overflow-hidden">
                {preview && (
                  <img
                    src={preview}
                    alt="Invoice preview"
                    className="w-full h-full object-contain"
                  />
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={clearFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground truncate">
                  {file.name}
                </div>
                <Button
                  onClick={handleExtract}
                  disabled={isExtracting}
                  size="sm"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-2" />
                      Extract Fields
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Right: Extracted Data Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Extracted Fields
            </span>
            {extractedData && (
              <ConfidenceBadge
                confidence={extractedData.ocrConfidence}
                size="sm"
              />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!extractedData ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-4 opacity-50" />
              <p className="text-sm">
                Upload and extract an invoice to see the results
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {isDuplicateWarning && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Possible Duplicate</AlertTitle>
                  <AlertDescription>
                    This invoice may already exist in the system. Please verify before
                    proceeding.
                  </AlertDescription>
                </Alert>
              )}

              <ExtractedField
                label="Invoice Number"
                value={getFieldValue('invoiceNumber')}
                originalValue={extractedData.invoiceNumber}
                isCorrected={isFieldCorrected('invoiceNumber')}
                onChange={(value) => handleFieldChange('invoiceNumber', value)}
                confidence={extractedData.ocrConfidence}
              />

              <ExtractedField
                label="Vendor Name"
                value={getFieldValue('vendorName')}
                originalValue={extractedData.vendorName}
                isCorrected={isFieldCorrected('vendorName')}
                onChange={(value) => handleFieldChange('vendorName', value)}
                confidence={extractedData.ocrConfidence}
              />

              <ExtractedField
                label="Date"
                value={getFieldValue('date')}
                originalValue={extractedData.date}
                isCorrected={isFieldCorrected('date')}
                onChange={(value) => handleFieldChange('date', value)}
                type="date"
                confidence={extractedData.ocrConfidence}
              />

              <div className="grid grid-cols-3 gap-3">
                <ExtractedField
                  label="Subtotal"
                  value={getFieldValue('subtotal')}
                  originalValue={extractedData.subtotal}
                  isCorrected={isFieldCorrected('subtotal')}
                  onChange={(value) =>
                    handleFieldChange('subtotal', parseFloat(value) || null)
                  }
                  type="number"
                  confidence={extractedData.ocrConfidence}
                />

                <ExtractedField
                  label="Tax"
                  value={getFieldValue('tax')}
                  originalValue={extractedData.tax}
                  isCorrected={isFieldCorrected('tax')}
                  onChange={(value) =>
                    handleFieldChange('tax', parseFloat(value) || null)
                  }
                  type="number"
                  confidence={extractedData.ocrConfidence}
                />

                <ExtractedField
                  label="Total"
                  value={getFieldValue('total')}
                  originalValue={extractedData.total}
                  isCorrected={isFieldCorrected('total')}
                  onChange={(value) =>
                    handleFieldChange('total', parseFloat(value) || null)
                  }
                  type="number"
                  confidence={extractedData.ocrConfidence}
                />
              </div>

              {/* Line Items Summary */}
              {extractedData.lineItems.length > 0 && (
                <div className="pt-3 border-t">
                  <Label className="text-sm font-medium">
                    Line Items ({extractedData.lineItems.length})
                  </Label>
                  <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                    {extractedData.lineItems.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1"
                      >
                        <span className="truncate flex-1">{item.description}</span>
                        <span className="text-muted-foreground ml-2">
                          {item.quantity} x ${item.unitPrice.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  {hasCorrections && (
                    <Badge variant="secondary" className="text-xs">
                      {Object.keys(editedData).length} corrections
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {vendorId && hasCorrections && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLearn}
                      disabled={isLearning}
                    >
                      {isLearning ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Save Layout'
                      )}
                    </Button>
                  )}
                  <Button size="sm" onClick={handleApply}>
                    <Check className="h-4 w-4 mr-1" />
                    Apply to Form
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ExtractedFieldProps {
  label: string;
  value: any;
  originalValue: any;
  isCorrected: boolean;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'date';
  confidence?: number;
}

function ExtractedField({
  label,
  value,
  originalValue,
  isCorrected,
  onChange,
  type = 'text',
  confidence = 1,
}: ExtractedFieldProps) {
  const isLowConfidence = confidence < 0.7;
  const displayValue = value ?? '';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        {isCorrected && (
          <Badge variant="secondary" className="text-xs">
            Corrected
          </Badge>
        )}
      </div>
      <Input
        type={type}
        value={displayValue}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          isLowConfidence && !isCorrected && 'border-yellow-300 bg-yellow-50',
          isCorrected && 'border-blue-300 bg-blue-50'
        )}
      />
      {isLowConfidence && !isCorrected && originalValue && (
        <p className="text-xs text-yellow-600">
          Low confidence - please verify this value
        </p>
      )}
    </div>
  );
}
