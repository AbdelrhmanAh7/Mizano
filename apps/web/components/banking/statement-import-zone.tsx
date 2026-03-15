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

interface ImportResult {
  imported: number;
  duplicates: number;
  rulesApplied: number;
  total: number;
}

export function StatementImportZone() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: accountsData } = useBankAccounts();
  const accounts = accountsData?.data || accountsData || [];
  const importMutation = useImportTransactions();

  const isLoading = importMutation.isPending;

  const handleFile = async (file: File) => {
    if (!selectedAccountId) {
      setError('Please select a bank account first');
      return;
    }
    setError(null);
    setResult(null);

    try {
      const res = await importMutation.mutateAsync({ bankAccountId: selectedAccountId, file });
      const data = (res as { data?: ImportResult })?.data || (res as ImportResult);
      setResult(data);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      setError(apiErr.response?.data?.message || 'Failed to import statement');
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
        <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Select bank account..." />
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
        <p className="text-sm font-medium">
          {isDragging ? 'Drop file here' : 'Drag & drop or click to upload'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">CSV, Excel, OFX, QFX files</p>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Importing transactions...</p>
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
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {result.total} total
              </span>
              <span className="font-medium">{result.imported} imported</span>
              <span className="text-muted-foreground">{result.duplicates} duplicates skipped</span>
              <span className="text-blue-700">{result.rulesApplied} rules applied</span>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {result && (
        <Button variant="outline" size="sm" onClick={() => setResult(null)}>
          Import Another File
        </Button>
      )}
    </div>
  );
}
