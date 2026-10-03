'use client';

import { useDocumentMoney } from '@/lib/hooks/use-organization';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, Building2, CreditCard, Calendar, Receipt, Banknote, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useVendorCredit,
  useApplyVendorCredit,
  useRefundVendorCredit,
  useVoidVendorCredit,
} from '@/lib/hooks/use-vendor-credits';
import { useQuery } from '@tanstack/react-query';
import { billsApi, vendorCreditsApi } from '@/lib/api';
import { compareDecimals } from '@/lib/decimal';
import { usePermissions } from '@/lib/hooks/use-permissions';

interface VendorCreditDetailPageProps {
  params: { id: string };
}

export default function VendorCreditDetailPage({ params }: VendorCreditDetailPageProps) {
  const { id } = params;
  const t = useTranslations('purchases');
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('purchases.edit');
  const canDelete = hasPermission('purchases.delete');

  const { data: credit, isLoading } = useVendorCredit(id);
  const money = useDocumentMoney();
  const applyCredit = useApplyVendorCredit();
  const refundCredit = useRefundVendorCredit();
  const voidCredit = useVoidVendorCredit();

  // Fetch unpaid bills for the vendor
  const { data: billsData } = useQuery({
    queryKey: ['bills', 'unpaid', credit?.vendorId],
    queryFn: async () => {
      if (!credit?.vendorId) return { data: [] };
      const response = await billsApi.getAll({
        vendorId: credit.vendorId,
        status: 'OPEN,PARTIALLY_PAID,OVERDUE',
        hasBalance: true,
      });
      return response.data;
    },
    enabled: canEdit && !!credit?.vendorId && !credit?.appliedToBillId && !credit?.refundedAt,
  });

  // Bank/cash accounts a refund can be received into (role-scoped lookup, purchases.edit)
  const {
    data: refundAccounts = [],
    isLoading: refundAccountsLoading,
    isError: refundAccountsError,
    refetch: refetchRefundAccounts,
  } = useQuery({
    queryKey: ['vendor-credits', 'refund-accounts'],
    queryFn: async (): Promise<Array<{ id: string; code: string; name: string }>> =>
      (await vendorCreditsApi.refundAccounts()).data,
    enabled: canEdit && !!credit && !credit.appliedToBillId && !credit.refundedAt,
  });

  // The whole credit is applied, so only bills with enough balance can take it.
  const unpaidBills = (
    (billsData?.data || []) as Array<{
      id: string;
      billNumber: string;
      balanceDue: string | number;
    }>
  ).filter((b) => !credit || compareDecimals(b.balanceDue, credit.amount) >= 0);

  const handleApplyToBill = async () => {
    if (!selectedBillId) return;
    await applyCredit.mutateAsync({ id, billId: selectedBillId });
    setApplyDialogOpen(false);
    setSelectedBillId('');
  };

  const handleVoid = async (): Promise<void> => {
    await voidCredit.mutateAsync(id);
    setVoidDialogOpen(false);
  };

  const handleRefund = async () => {
    if (!selectedAccountId) return;
    await refundCredit.mutateAsync({ id, bankAccountId: selectedAccountId });
    setRefundDialogOpen(false);
    setSelectedAccountId('');
  };

  const isVoided = !!credit?.deletedAt;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!credit) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('credits.creditNotFound')}</p>
        <Button asChild className="mt-4">
          <Link href="/purchases/credits">{t('credits.backToCredits')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
            <Link href="/purchases/credits">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight font-mono">{credit.creditNumber}</h1>
              {isVoided ? (
                <Badge variant="destructive">{t('credits.voided')}</Badge>
              ) : (
                <Badge variant={credit.appliedToBillId ? 'secondary' : 'default'}>
                  {credit.appliedToBillId ? 'Applied' : credit.refundedAt ? 'Refunded' : 'Open'}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {t('credits.creditFrom', { name: credit.vendor?.name || '' })}
            </p>
          </div>
        </div>

        {/* Actions */}
        {!isVoided && !credit.appliedToBillId && !credit.refundedAt && (canEdit || canDelete) && (
          <div className="flex items-center gap-2">
            {canEdit && (
              <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Receipt className="mr-2 h-4 w-4" />
                    {t('credits.applyToBill')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('credits.applyCreditToBill')}</DialogTitle>
                    <DialogDescription>{t('credits.applyCreditDescription')}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>{t('credits.selectBill')}</Label>
                      <Select value={selectedBillId} onValueChange={setSelectedBillId}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('credits.selectBillPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {unpaidBills.length === 0 ? (
                            <SelectItem value="" disabled>
                              {t('credits.noUnpaidBills')}
                            </SelectItem>
                          ) : (
                            unpaidBills.map(
                              (bill: {
                                id: string;
                                billNumber: string;
                                balanceDue: string | number;
                              }) => (
                                <SelectItem key={bill.id} value={bill.id}>
                                  {bill.billNumber} - {money(bill.balanceDue)}
                                </SelectItem>
                              ),
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleApplyToBill}
                      disabled={!selectedBillId || applyCredit.isPending}
                    >
                      {applyCredit.isPending ? t('credits.applying') : t('credits.applyCredit')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {canEdit && (
              <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Banknote className="mr-2 h-4 w-4" />
                    {t('credits.recordRefund')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('credits.recordRefund')}</DialogTitle>
                    <DialogDescription>{t('credits.recordRefundDescription')}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>{t('credits.depositToAccount')}</Label>
                      <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('credits.selectAccount')} />
                        </SelectTrigger>
                        <SelectContent>
                          {refundAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.code} - {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {refundAccountsLoading && <Skeleton className="h-10 w-full" />}
                    {refundAccountsError && (
                      <div className="flex items-center justify-between gap-2" role="alert">
                        <p className="text-sm text-destructive">
                          {t('credits.refundAccountsError')}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void refetchRefundAccounts()}
                        >
                          {t('credits.retry')}
                        </Button>
                      </div>
                    )}
                    {!refundAccountsLoading &&
                      !refundAccountsError &&
                      refundAccounts.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          {t('credits.noRefundAccounts')}
                        </p>
                      )}
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">{t('credits.refundAmount')}</p>
                      <p className="text-2xl font-bold font-mono">
                        {money(credit.appliedToBillId ? '0' : credit.amount)}
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setRefundDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleRefund}
                      disabled={!selectedAccountId || refundCredit.isPending}
                    >
                      {refundCredit.isPending ? t('credits.processing') : t('credits.recordRefund')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {canDelete && (
              <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive">
                    <Ban className="mr-2 h-4 w-4" />
                    {t('credits.void')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('credits.void')}</DialogTitle>
                    <DialogDescription>{t('credits.voidDescription')}</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setVoidDialogOpen(false)}>
                      {t('credits.cancel')}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => void handleVoid()}
                      disabled={voidCredit.isPending}
                    >
                      {voidCredit.isPending ? t('credits.voiding') : t('credits.void')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CreditCard className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('credits.total')}</p>
                <p className="text-2xl font-bold font-mono">{money(credit.amount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Calendar className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('credits.date')}</p>
                <p className="text-2xl font-bold">{format(new Date(credit.date), 'MMM d, yyyy')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Building2 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('credits.balanceRemaining')}</p>
                <p className="text-2xl font-bold font-mono">
                  {money(credit.appliedToBillId ? '0' : credit.amount)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Credit Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('credits.creditDetails')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('credits.vendor')}</span>
              <Link
                href={`/purchases/vendors/${credit.vendorId}`}
                className="text-blue-600 hover:underline"
              >
                {credit.vendor?.name}
              </Link>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('credits.status')}</span>
              <Badge variant={credit.appliedToBillId ? 'secondary' : 'default'}>
                {credit.appliedToBillId ? 'Applied' : credit.refundedAt ? 'Refunded' : 'Open'}
              </Badge>
            </div>
            {credit.bill && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('credits.appliedToBill')}</span>
                <Link
                  href={`/purchases/bills/${credit.billId}`}
                  className="font-mono text-blue-600 hover:underline"
                >
                  {credit.bill.billNumber}
                </Link>
              </div>
            )}
            {credit.reason && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground mb-1">{t('credits.reason')}</p>
                <p className="text-sm">{credit.reason}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Totals */}
        <Card>
          <CardHeader>
            <CardTitle>{t('credits.summary')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-lg font-semibold border-t pt-3">
                <span>{t('credits.total')}</span>
                <span className="font-mono">{money(credit.amount)}</span>
              </div>
              <div className="flex justify-between text-lg border-t pt-3">
                <span className="text-muted-foreground">{t('credits.balanceRemaining')}</span>
                <span className="font-mono font-bold text-green-600">
                  {money(credit.appliedToBillId ? '0' : credit.amount)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      {credit.lines && credit.lines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('lineItems.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('credits.table.itemAccount')}</TableHead>
                  <TableHead>{t('credits.table.description')}</TableHead>
                  <TableHead className="text-right">{t('credits.table.qty')}</TableHead>
                  <TableHead className="text-right">{t('credits.table.rate')}</TableHead>
                  <TableHead className="text-right">{t('credits.table.taxPercent')}</TableHead>
                  <TableHead className="text-right">{t('credits.table.amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {credit.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.item?.name || line.account?.name || '-'}</TableCell>
                    <TableCell>{line.description || '-'}</TableCell>
                    <TableCell className="text-right font-mono">{line.quantity}</TableCell>
                    <TableCell className="text-right font-mono">{money(line.rate)}</TableCell>
                    <TableCell className="text-right font-mono">{line.taxRate}%</TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {money(line.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
