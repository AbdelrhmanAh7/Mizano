'use client';

import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import {
  type ExportFormat,
  type ImportEntityType,
  useExportData,
} from '@/lib/hooks/use-import-export';
import { useCallback, useState } from 'react';

/**
 * Hook to handle "Export All" functionality from virtualized DataTables.
 * Triggers a full server-side export for a given entity type.
 *
 * @param entityType - The entity type to export (e.g., 'invoices', 'customers')
 * @param filename - Base filename for the downloaded file (without extension)
 * @returns onExportAll callback suitable for DataTable's `onExportAll` prop
 */
export function useExportAll(entityType: ImportEntityType, filename: string) {
  const { toast } = useToast();
  const t = useTranslations('common.exportAll');
  const exportData = useExportData();
  const [isExporting, setIsExporting] = useState(false);

  const onExportAll = useCallback(
    async (format: 'csv' | 'xlsx') => {
      if (isExporting) return;
      setIsExporting(true);

      toast({
        title: t('exporting'),
        description: t('exportingDescription', { format: format.toUpperCase() }),
      });

      try {
        const blob = await exportData.mutateAsync({
          entityType,
          options: { format: format as ExportFormat },
        });

        // Trigger browser download
        const url = window.URL.createObjectURL(new Blob([blob]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${filename}.${format}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        toast({
          title: t('complete'),
          description: t('completeDescription', { file: `${filename}.${format}` }),
        });
      } catch {
        toast({
          title: t('failed'),
          description: t('failedDescription'),
          variant: 'destructive',
        });
      } finally {
        setIsExporting(false);
      }
    },
    [entityType, filename, exportData, isExporting, toast, t],
  );

  return { onExportAll, isExporting };
}
