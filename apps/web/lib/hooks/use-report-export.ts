'use client';

import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

type ReportType = 'profit-and-loss' | 'balance-sheet' | 'receivables-aging' | 'payables-aging';

interface ExportParams {
  reportType: ReportType;
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
}

function buildUrl(params: ExportParams): string {
  const base = `/reports/${params.reportType}/pdf`;
  const qs = new URLSearchParams();
  if (params.startDate) qs.set('startDate', params.startDate);
  if (params.endDate) qs.set('endDate', params.endDate);
  if (params.asOfDate) qs.set('asOfDate', params.asOfDate);
  const query = qs.toString();
  return query ? `${base}?${query}` : base;
}

function buildFilename(params: ExportParams): string {
  switch (params.reportType) {
    case 'profit-and-loss':
      return `profit-and-loss-${params.startDate}-${params.endDate}.pdf`;
    case 'balance-sheet':
      return `balance-sheet-${params.asOfDate}.pdf`;
    case 'receivables-aging':
      return `receivables-aging-${params.asOfDate || 'current'}.pdf`;
    case 'payables-aging':
      return `payables-aging-${params.asOfDate || 'current'}.pdf`;
    default:
      return 'report.pdf';
  }
}

/**
 * Hook to export financial reports as PDF.
 *
 * Usage:
 * ```tsx
 * const { mutate: exportPdf, isPending } = useExportReportPdf();
 *
 * exportPdf({ reportType: 'profit-and-loss', startDate: '2025-01-01', endDate: '2025-12-31' });
 * exportPdf({ reportType: 'balance-sheet', asOfDate: '2025-12-31' });
 * exportPdf({ reportType: 'receivables-aging', asOfDate: '2025-12-31' });
 * ```
 */
export function useExportReportPdf() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: ExportParams) => {
      const url = buildUrl(params);
      const response = await api.get(url, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = buildFilename(params);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    },
    onSuccess: () => {
      toast({
        title: 'PDF exported',
        description: 'The report has been downloaded successfully.',
      });
    },
    onError: () => {
      toast({
        title: 'Export failed',
        description: 'Could not generate the PDF. Please try again.',
        variant: 'destructive',
      });
    },
  });
}
