'use client';

import { useRef, useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useBankAccounts } from '@/lib/hooks/use-bank-accounts';
import { useImportTransactions } from '@/lib/hooks/use-bank-transactions';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';
import { useTranslations } from 'next-intl';

interface ImportResult {
  imported: number;
  duplicates: number;
  rulesApplied: number;
  total: number;
}

export function StatementImportZone() {
  const t = useTranslations('banking.import');
  const tCommon = useTranslations('common');
  const tApiErrors = useTranslations('common.apiErrors');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    data: accountsData,
    isError: accountsFailed,
    isLoading: accountsLoading,
    refetch: refetchAccounts,
  } = useBankAccounts();
  const accounts = accountsData?.data || accountsData || [];
  const importMutation = useImportTransactions();

  const isLoading = importMutation.isPending;

  const handleFile = async (file: File) => {
    if (!selectedAccountId) {
      setError(t('selectAccountFirst'));
      return;
    }
    setError(null);
    setResult(null);

    try {
      const res = await importMutation.mutateAsync({ bankAccountId: selectedAccountId, file });
      const data =
        (res as unknown as { data?: ImportResult })?.data || (res as unknown as ImportResult);
      setResult(data);
    } catch (err: unknown) {
      setError(getLocalizedApiErrorMessage(err, t('failed'), tApiErrors));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select
          value={selectedAccountId}
          onValueChange={setSelectedAccountId}
          disabled={accountsLoading || accountsFailed}
        >
          <SelectTrigger className="w-[260px]">
            <SelectValue
              placeholder={accountsLoading ? tCommon('loading.default') : t('selectAccount')}
            />
          </SelectTrigger>
          <SelectContent>
            {(Array.isArray(accounts) ? accounts : []).map(
              (acc: { id: string; name?: string; accountName?: string }) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.name || acc.accountName}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        {accountsFailed && (
          <span className="flex items-center gap-2 text-sm text-destructive">
            {t('accountsFailed')}
            <Button variant="outline" size="sm" onClick={() => void refetchAccounts()}>
              {tCommon('combobox.retry')}
            </Button>
          </span>
        )}
      </div>

      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50',
          !selectedAccountId && 'opacity-50 cursor-not-allowed',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={selectedAccountId ? handleDrop : undefined}
        onClick={() => selectedAccountId && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.ofx,.qfx"
          className="hidden"
          onChange={handleInputChange}
        />
        <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm font-medium">{isDragging ? t('dropHere') : t('dragOrClick')}</p>
        <p className="text-xs text-muted-foreground mt-1">{t('formats')}</p>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t('importing')}</p>
          <Progress className="h-2" value={undefined} />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Alert className="border-success/30 bg-success/5">
          <CheckCircle className="h-4 w-4 text-success" />
          <AlertDescription className="text-success">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {t('total', { count: result.total })}
              </span>
              <span className="font-medium">{t('imported', { count: result.imported })}</span>
              <span className="text-muted-foreground">
                {t('duplicates', { count: result.duplicates })}
              </span>
              <span className="text-info">{t('rulesApplied', { count: result.rulesApplied })}</span>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {result && (
        <Button variant="outline" size="sm" onClick={() => setResult(null)}>
          {t('another')}
        </Button>
      )}
    </div>
  );
}
