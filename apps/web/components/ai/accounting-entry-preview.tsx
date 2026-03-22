'use client';

import { useState } from 'react';
import { BookOpen, X, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface AccountingEntryPreviewProps {
  entry: {
    debitAccount: string | null;
    creditAccount: string | null;
    taxAccount: string | null;
  };
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  onDismiss?: () => void;
}

export function AccountingEntryPreview({
  entry,
  subtotal,
  taxAmount,
  totalAmount,
  onDismiss,
}: AccountingEntryPreviewProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !entry) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-blue-600" />
          Suggested Journal Entry
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
            <Sparkles className="h-3 w-3 mr-1" />
            AI Suggestion
          </Badge>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDismiss}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50%]">Account</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Debit: Main expense account */}
            <TableRow>
              <TableCell className="font-medium">{entry.debitAccount || 'Purchases'}</TableCell>
              <TableCell className="text-right">{formatAmount(subtotal)}</TableCell>
              <TableCell className="text-right text-muted-foreground">-</TableCell>
            </TableRow>
            {/* Debit: Tax account (only if tax > 0) */}
            {taxAmount > 0 && entry.taxAccount && (
              <TableRow>
                <TableCell className="font-medium">{entry.taxAccount}</TableCell>
                <TableCell className="text-right">{formatAmount(taxAmount)}</TableCell>
                <TableCell className="text-right text-muted-foreground">-</TableCell>
              </TableRow>
            )}
            {/* Credit: Accounts Payable */}
            <TableRow>
              <TableCell className="font-medium">
                {entry.creditAccount || 'Accounts Payable'}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">-</TableCell>
              <TableCell className="text-right">{formatAmount(totalAmount)}</TableCell>
            </TableRow>
            {/* Totals row */}
            <TableRow className="font-semibold border-t-2">
              <TableCell>Total</TableCell>
              <TableCell className="text-right">{formatAmount(totalAmount)}</TableCell>
              <TableCell className="text-right">{formatAmount(totalAmount)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function formatAmount(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
