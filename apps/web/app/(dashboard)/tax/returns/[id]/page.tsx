'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Printer,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useVATReturn,
  useFileVATReturn,
  getVATReturnStatusLabel,
  getVATReturnStatusColor,
  formatCurrency,
} from '@/lib/hooks/use-tax';

export default function VATReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [showFileDialog, setShowFileDialog] = useState(false);

  const { data: vatReturn, isLoading } = useVATReturn(id);
  const fileVATReturn = useFileVATReturn();

  const handleFile = async () => {
    await fileVATReturn.mutateAsync(id);
    setShowFileDialog(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!vatReturn) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">VAT return not found</h2>
        <Button asChild className="mt-4">
          <Link href="/tax/returns">Back to VAT Returns</Link>
        </Button>
      </div>
    );
  }

  const outputVat = typeof vatReturn.outputVat === 'string'
    ? parseFloat(vatReturn.outputVat)
    : vatReturn.outputVat;
  const inputVat = typeof vatReturn.inputVat === 'string'
    ? parseFloat(vatReturn.inputVat)
    : vatReturn.inputVat;
  const netVat = outputVat - inputVat;

  const breakdown = vatReturn.breakdown || {};
  const invoices = breakdown.invoices || [];
  const creditNotes = breakdown.creditNotes || [];
  const bills = breakdown.bills || [];
  const expenses = breakdown.expenses || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/tax/returns">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                VAT Return
              </h1>
              <Badge
                variant="outline"
                className={getVATReturnStatusColor(vatReturn.status)}
              >
                {getVATReturnStatusLabel(vatReturn.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {format(new Date(vatReturn.startDate), 'MMMM d')} -{' '}
              {format(new Date(vatReturn.endDate), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {vatReturn.status === 'DRAFT' && (
            <Button onClick={() => setShowFileDialog(true)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              File Return
            </Button>
          )}
          {vatReturn.status === 'FILED' && (
            <Button asChild>
              <Link href={`/tax/payments/new?vatReturnId=${vatReturn.id}`}>
                <DollarSign className="mr-2 h-4 w-4" />
                Record Payment
              </Link>
            </Button>
          )}
          <Button variant="outline">
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Output VAT</p>
                <p className="text-2xl font-bold font-mono text-green-600">
                  {formatCurrency(outputVat)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Input VAT</p>
                <p className="text-2xl font-bold font-mono text-red-600">
                  {formatCurrency(inputVat)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={netVat >= 0 ? 'bg-blue-50' : 'bg-green-50'}>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              {netVat >= 0 ? 'Net Payable' : 'Net Refundable'}
            </p>
            <p className="text-2xl font-bold font-mono">
              {formatCurrency(Math.abs(netVat))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Filed Date</p>
            <p className="text-2xl font-bold">
              {vatReturn.filedAt
                ? format(new Date(vatReturn.filedAt), 'MMM d, yyyy')
                : 'Not filed'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Tabs */}
      <Tabs defaultValue="output">
        <TabsList>
          <TabsTrigger value="output">Output VAT</TabsTrigger>
          <TabsTrigger value="input">Input VAT</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="output" className="space-y-6">
          {/* Invoices */}
          <Card>
            <CardHeader>
              <CardTitle>Sales Invoices</CardTitle>
              <CardDescription>
                VAT collected from sales
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invoices.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono">{inv.invoiceNumber}</TableCell>
                        <TableCell>{inv.customer?.name}</TableCell>
                        <TableCell>{format(new Date(inv.date), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(inv.subtotal)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-600">
                          {formatCurrency(inv.taxAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-8 text-muted-foreground">
                  No invoices in this period
                </p>
              )}
            </CardContent>
          </Card>

          {/* Credit Notes */}
          {creditNotes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Credit Notes</CardTitle>
                <CardDescription>
                  VAT adjustments from credit notes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Credit Note #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creditNotes.map((cn: any) => (
                      <TableRow key={cn.id}>
                        <TableCell className="font-mono">{cn.creditNoteNumber}</TableCell>
                        <TableCell>{cn.customer?.name}</TableCell>
                        <TableCell>{format(new Date(cn.date), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="text-right font-mono text-red-600">
                          -{formatCurrency(cn.taxAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="input" className="space-y-6">
          {/* Bills */}
          <Card>
            <CardHeader>
              <CardTitle>Purchase Bills</CardTitle>
              <CardDescription>
                VAT paid on purchases
              </CardDescription>
            </CardHeader>
            <CardContent>
              {bills.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill #</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bills.map((bill: any) => (
                      <TableRow key={bill.id}>
                        <TableCell className="font-mono">{bill.billNumber}</TableCell>
                        <TableCell>{bill.vendor?.name}</TableCell>
                        <TableCell>{format(new Date(bill.date), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(bill.subtotal)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-red-600">
                          {formatCurrency(bill.taxAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-8 text-muted-foreground">
                  No bills in this period
                </p>
              )}
            </CardContent>
          </Card>

          {/* Expenses */}
          {expenses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Expenses</CardTitle>
                <CardDescription>
                  VAT paid on expenses
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((exp: any) => (
                      <TableRow key={exp.id}>
                        <TableCell>{exp.description}</TableCell>
                        <TableCell>{format(new Date(exp.date), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(exp.amount)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-red-600">
                          {formatCurrency(exp.taxAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle>VAT Calculation Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between py-2 border-b">
                  <span>Output VAT (Sales)</span>
                  <span className="font-mono text-green-600">
                    {formatCurrency(outputVat)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span>Input VAT (Purchases)</span>
                  <span className="font-mono text-red-600">
                    -{formatCurrency(inputVat)}
                  </span>
                </div>
                <div className="flex justify-between py-4 text-lg font-bold">
                  <span>{netVat >= 0 ? 'Net VAT Payable' : 'Net VAT Refundable'}</span>
                  <span className="font-mono">
                    {formatCurrency(Math.abs(netVat))}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* File Dialog */}
      <AlertDialog open={showFileDialog} onOpenChange={setShowFileDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>File VAT Return</AlertDialogTitle>
            <AlertDialogDescription>
              This will finalize the VAT return and lock the period. Make sure
              all transactions are correct before filing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFile}
              disabled={fileVATReturn.isPending}
            >
              {fileVATReturn.isPending ? 'Filing...' : 'File Return'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
