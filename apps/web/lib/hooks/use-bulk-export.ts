'use client';

import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

type ExportFormat = 'csv' | 'xlsx';

interface UseBulkExportOptions {
  /** Entity type for the export endpoint (e.g., 'invoices', 'bills') */
  entityType: string;
  /** Filename for the downloaded file (without extension) */
  filename?: string;
}

export function useBulkExport({ entityType, filename }: UseBulkExportOptions) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const mutation = useMutation({
    mutationFn: async ({ ids, format = 'csv' }: { ids: string[]; format?: ExportFormat }) => {
      setIsExporting(true);
      const response = await api.post(
        '/export/bulk',
        { ids, entityType, format },
        { responseType: 'blob' },
      );
      return { blob: response.data as Blob, format };
    },
    onSuccess: ({ blob, format }) => {
      const ext = format === 'xlsx' ? 'xlsx' : 'csv';
      const downloadFilename = `${filename || entityType}-export-${Date.now()}.${ext}`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadFilename;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Export complete',
        description: `${entityType} exported successfully.`,
      });
      setIsExporting(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Export failed',
        description: error.message || `Failed to export ${entityType}.`,
        variant: 'destructive',
      });
      setIsExporting(false);
    },
  });

  const exportSelected = useCallback(
    (ids: string[], format: ExportFormat = 'csv') => {
      return mutation.mutateAsync({ ids, format });
    },
    [mutation],
  );

  return {
    exportSelected,
    isExporting: isExporting || mutation.isPending,
  };
}
