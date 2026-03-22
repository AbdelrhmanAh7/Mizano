'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomerStatement, Customer, formatCurrency } from '@/lib/hooks/use-customers';
import { cn } from '@/lib/utils';

interface CustomerStatementProps {
  customerId: string;
  customer?: Customer;
}

interface StatementLine {
  id: string;
  date: string;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE';
  reference: string;
  description?: string;
  debit: number;
  credit: number;
  link?: string;
}

export function CustomerStatement({ customerId, customer }: CustomerStatementProps) {
  const { data: statementData, isLoading } = useCustomerStatement(customerId);

  const currency = customer?.currency || 'USD';

  // Create unified statement from invoices, payments, credit notes
  const statement = useMemo(() => {
    if (!statementData) return [];

    const lines: StatementLine[] = [];

    // Add invoices as debits (increase balance owed)
    (statementData.invoices || []).forEach((inv) => {
      lines.push({
        id: inv.id,
        date: inv.date,
        type: 'INVOICE',
        reference: inv.invoiceNumber,
        description: `Invoice ${inv.invoiceNumber}`,
        debit: parseFloat(inv.grandTotal || '0'),
        credit: 0,
        link: `/sales/invoices/${inv.id}`,
      });
    });

    // Add payments as credits (decrease balance owed)
    (statementData.payments || []).forEach((pmt) => {
      lines.push({
        id: pmt.id,
        date: pmt.date,
        type: 'PAYMENT',
        reference: pmt.paymentNumber,
        description: `Payment ${pmt.paymentNumber} (${pmt.paymentMode?.replace('_', ' ')})`,
        debit: 0,
        credit: parseFloat(pmt.amount || '0'),
        link: `/sales/payments/${pmt.id}`,
      });
    });

    // Add credit notes as credits (decrease balance owed)
    (statementData.creditNotes || []).forEach((cn) => {
      lines.push({
        id: cn.id,
        date: cn.date,
        type: 'CREDIT_NOTE',
        reference: cn.creditNoteNumber,
        description: `Credit Note ${cn.creditNoteNumber}`,
        debit: 0,
        credit: parseFloat(cn.amount || '0'),
        link: `/sales/credit-notes/${cn.id}`,
      });
    });

    // Sort by date ascending
    lines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return lines;
  }, [statementData]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalDebits = statement.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = statement.reduce((sum, line) => sum + line.credit, 0);
    const balance = totalDebits - totalCredits;

    return { totalDebits, totalCredits, balance };
  }, [statement]);

  // Calculate running balance for each line
  const statementWithBalance = useMemo(() => {
    let runningBalance = 0;
    return statement.map((line) => {
      runningBalance += line.debit - line.credit;
      return { ...line, runningBalance };
    });
  }, [statement]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Invoiced</div>
            <div className="text-2xl font-bold font-mono text-blue-600">
              {formatCurrency(totals.totalDebits, currency)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Paid</div>
            <div className="text-2xl font-bold font-mono text-green-600">
              {formatCurrency(totals.totalCredits, currency)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Outstanding Balance</div>
            <div
              className={cn(
                'text-2xl font-bold font-mono',
                totals.balance > 0 ? 'text-red-600' : totals.balance < 0 ? 'text-green-600' : '',
              )}
            >
              {formatCurrency(totals.balance, currency)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statement Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {statementWithBalance.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No transactions found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Transaction Rows */}
                {statementWithBalance.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{format(new Date(line.date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          line.type === 'INVOICE' && 'bg-blue-100 text-blue-800',
                          line.type === 'PAYMENT' && 'bg-green-100 text-green-800',
                          line.type === 'CREDIT_NOTE' && 'bg-yellow-100 text-yellow-800',
                        )}
                      >
                        {line.type.replace('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {line.link ? (
                        <Link href={line.link} className="text-blue-600 hover:underline">
                          {line.reference}
                        </Link>
                      ) : (
                        line.reference
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {line.description || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {line.debit > 0 ? formatCurrency(line.debit, currency) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {line.credit > 0 ? formatCurrency(line.credit, currency) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(line.runningBalance, currency)}
                    </TableCell>
                  </TableRow>
                ))}

                {/* Closing Balance Row */}
                <TableRow className="border-t-2 bg-muted/50">
                  <TableCell colSpan={4} className="font-semibold">
                    Balance Due
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(totals.totalDebits, currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(totals.totalCredits, currency)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-mono font-bold',
                      totals.balance > 0
                        ? 'text-red-600'
                        : totals.balance < 0
                          ? 'text-green-600'
                          : '',
                    )}
                  >
                    {formatCurrency(totals.balance, currency)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
