'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Download, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  documentLocaleFor,
  downloadDocumentPdf,
  openDocumentPdfForPrint,
  type PdfDocumentKind,
} from '@/lib/hooks/use-documents';

interface DocumentPdfActionsProps {
  kind: PdfDocumentKind;
  documentId: string;
  documentNumber: string;
}

/**
 * "Export PDF" and "Print" for an invoice, quote or bill, in the page language (Arabic renders
 * right-to-left with the organization's digits). Gate it with the PDF route's permission.
 */
export function DocumentPdfActions({
  kind,
  documentId,
  documentNumber,
}: DocumentPdfActionsProps): JSX.Element {
  const t = useTranslations('common.documentPdf');
  const pdfLocale = documentLocaleFor(useLocale());
  const { toast } = useToast();
  const [busy, setBusy] = useState<'download' | 'print' | null>(null);

  const showError = () =>
    toast({ title: t('error'), description: t('errorDescription'), variant: 'destructive' });

  const handleDownload = async () => {
    setBusy('download');
    try {
      await downloadDocumentPdf(kind, documentId, documentNumber, pdfLocale);
    } catch {
      showError();
    } finally {
      setBusy(null);
    }
  };

  // Must stay synchronous up to window.open (inside openDocumentPdfForPrint) for popup blockers.
  const handlePrint = async () => {
    setBusy('print');
    try {
      await openDocumentPdfForPrint(kind, documentId, pdfLocale);
    } catch {
      showError();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={handleDownload} disabled={busy !== null}>
        {busy === 'download' ? (
          <Loader2 className="me-2 h-4 w-4 animate-spin" />
        ) : (
          <Download className="me-2 h-4 w-4" />
        )}
        {t('exportPdf')}
      </Button>
      <Button variant="outline" onClick={handlePrint} disabled={busy !== null}>
        {busy === 'print' ? (
          <Loader2 className="me-2 h-4 w-4 animate-spin" />
        ) : (
          <Printer className="me-2 h-4 w-4" />
        )}
        {t('print')}
      </Button>
    </>
  );
}
