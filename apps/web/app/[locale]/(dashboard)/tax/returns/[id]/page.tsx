'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ArrowLeft,
  FileCheck,
  Trash2,
  DollarSign,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  Calculator,
  CheckCircle2,
  Circle,
  Receipt,
  ShoppingCart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  useVATReturn,
  useFileVATReturn,
  useCalculateVATReturn,
  useDeleteVATReturn,
  useRecordVATPayment,
  useMarkVATReturnFiled,
  useVatPaymentAccounts,
  getVATReturnStatusColor,
  getVATReturnStatusLabel,
  getVATReturnStatusStep,
  formatCurrency,
  normalizeVATReturn,
  VATReturnStatus,
} from '@/lib/hooks/use-tax';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { cn } from '@/lib/utils';

const STATUS_STEPS: { key: VATReturnStatus; icon: typeof Circle }[] = [
  { key: 'DRAFT', icon: Circle },
  { key: 'CALCULATED', icon: Calculator },
  { key: 'SUBMITTED', icon: FileCheck },
  { key: 'FILED', icon: CheckCircle2 },
];

/** Formats a decimal (string or number) with exactly four fraction digits, without float maths on strings. */
function toDecimalString(value: number | string): string {
  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return Number(value).toFixed(4);
  const [int, frac = ''] = text.split('.');
  return `${int}.${frac.padEnd(4, '0').slice(0, 4)}`;
}

export default function VATReturnDetailPage() {
  const t = useTranslations('tax');
  const tCommon = useTranslations('common');
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const returnId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentRef, setPaymentRef] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');

  const { data: rawVatReturn, isLoading } = useVATReturn(returnId);
  const vatReturn = rawVatReturn ? normalizeVATReturn(rawVatReturn) : null;
  const fileReturn = useFileVATReturn();
  const calculateReturn = useCalculateVATReturn();
  const deleteReturn = useDeleteVATReturn();
  const createPayment = useRecordVATPayment();
  const markFiled = useMarkVATReturnFiled();

  const canEdit = hasPermission('tax.edit');
  const canSubmit = hasPermission('tax.submit');
  const {
    data: paidFromOptions = [],
    isLoading: accountsLoading,
    isError: accountsError,
  } = useVatPaymentAccounts(canEdit);
  const canDelete = hasPermission('tax.delete');

  const confirmFile = async () => {
    try {
      await fileReturn.mutateAsync(returnId);
      toast({ title: t('returns.fileSuccess') });
      setFileDialogOpen(false);
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.generic'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('returns.fileFail'),
        variant: 'destructive',
      });
    }
  };

  const handleMarkFiled = async (): Promise<void> => {
    try {
      await markFiled.mutateAsync(returnId);
      toast({ title: t('returns.markFiledSuccess') });
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.generic'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('returns.markFiledFail'),
        variant: 'destructive',
      });
    }
  };

  const handleCalculate = async () => {
    try {
      await calculateReturn.mutateAsync(returnId);
      toast({ title: t('returns.calculateSuccess') });
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.generic'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('returns.calculateFail'),
        variant: 'destructive',
      });
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteReturn.mutateAsync(returnId);
      toast({ title: t('returns.deleteSuccess') });
      router.push('/tax/returns');
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.generic'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('returns.deleteFail'),
        variant: 'destructive',
      });
    }
    setDeleteDialogOpen(false);
  };

  const handleRecordPayment = async () => {
    try {
      await createPayment.mutateAsync({
        vatReturnId: returnId,
        amount: paymentAmount,
        date: paymentDate,
        paidFromAccountId: bankAccountId,
        reference: paymentRef || undefined,
      });
      toast({ title: t('payments.recordSuccess') });
      setPaymentDialogOpen(false);
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.generic'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('payments.recordFail'),
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!vatReturn) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/tax/returns">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">{t('returns.notFound')}</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('returns.notFoundDescription')}</p>
            <Button asChild className="mt-4">
              <Link href="/tax/returns">{t('returns.backToReturns')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const netVat =
    typeof vatReturn.netVat === 'string' ? parseFloat(vatReturn.netVat) : vatReturn.netVat;
  const isDraft = vatReturn.status === 'DRAFT';
  const isCalculated = vatReturn.status === 'CALCULATED';
  const isSubmitted = vatReturn.status === 'SUBMITTED';
  // The API takes the exact net payable (no partial payments); send it as a 4-decimal string.
  const exactPayable = toDecimalString(vatReturn.netVat);
  const canPay = canEdit && isSubmitted && netVat > 0 && !vatReturn.payment;
  const currentStep = getVATReturnStatusStep(vatReturn.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/tax/returns">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {vatReturn.returnNumber || t('returns.vatReturn')}
              </h1>
              <Badge className={getVATReturnStatusColor(vatReturn.status)}>
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
          {canEdit && (isDraft || isCalculated) && (
            <Button
              onClick={handleCalculate}
              variant="outline"
              disabled={calculateReturn.isPending}
            >
              <Calculator className="mr-2 h-4 w-4" />
              {t('returns.calculateReturn')}
            </Button>
          )}
          {canSubmit && isCalculated && (
            <Button onClick={() => setFileDialogOpen(true)}>
              <FileCheck className="mr-2 h-4 w-4" />
              {t('returns.submitReturn')}
            </Button>
          )}
          {canPay && (
            <Button
              onClick={() => {
                setPaymentAmount(exactPayable);
                setPaymentDialogOpen(true);
              }}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {t('returns.recordPayment')}
            </Button>
          )}
          {canSubmit && isSubmitted && netVat <= 0 && (
            <Button onClick={handleMarkFiled} disabled={markFiled.isPending}>
              <FileCheck className="mr-2 h-4 w-4" />
              {t('returns.markFiled')}
            </Button>
          )}
          {canDelete && isDraft && (
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {tCommon('buttons.delete')}
            </Button>
          )}
        </div>
      </div>

      {/* Status Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            {STATUS_STEPS.map((step, index) => {
              const isActive = index <= currentStep;
              const isCurrent = index === currentStep;
              const StepIcon = step.icon;
              return (
                <div key={step.key} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors',
                        isCurrent
                          ? 'border-primary bg-primary text-primary-foreground'
                          : isActive
                            ? 'border-green-500 bg-green-50 text-green-600'
                            : 'border-muted bg-muted/30 text-muted-foreground',
                      )}
                    >
                      <StepIcon className="h-5 w-5" />
                    </div>
                    <span
                      className={cn(
                        'mt-2 text-xs font-medium',
                        isCurrent
                          ? 'text-primary'
                          : isActive
                            ? 'text-green-600'
                            : 'text-muted-foreground',
                      )}
                    >
                      {t(
                        `returns.statusFlow.${step.key.toLowerCase() as 'draft' | 'calculated' | 'submitted' | 'filed'}`,
                      )}
                    </span>
                  </div>
                  {index < STATUS_STEPS.length - 1 && (
                    <div
                      className={cn(
                        'flex-1 h-0.5 mx-4 mt-[-1.5rem]',
                        index < currentStep ? 'bg-green-500' : 'bg-muted',
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('returns.detail.overview')}</TabsTrigger>
          <TabsTrigger value="breakdown">{t('returns.detail.breakdown')}</TabsTrigger>
          <TabsTrigger value="payment">{t('returns.detail.payment')}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <ArrowUpRight className="h-4 w-4" />
                  {t('returns.outputVat')}
                </div>
                <div className="text-2xl font-bold font-mono">
                  {formatCurrency(vatReturn.outputVat)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <ArrowDownLeft className="h-4 w-4" />
                  {t('returns.inputVat')}
                </div>
                <div className="text-2xl font-bold font-mono">
                  {formatCurrency(vatReturn.inputVat)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <DollarSign className="h-4 w-4" />
                  {netVat >= 0 ? t('returns.netPayable') : t('returns.netRefundable')}
                </div>
                <div
                  className={cn(
                    'text-2xl font-bold font-mono',
                    netVat > 0 ? 'text-red-600' : 'text-green-600',
                  )}
                >
                  {formatCurrency(Math.abs(netVat))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <FileCheck className="h-4 w-4" />
                  {t('returns.filedDate')}
                </div>
                <div className="text-lg font-bold">
                  {vatReturn.filedAt
                    ? format(new Date(vatReturn.filedAt), 'MMM d, yyyy')
                    : t('returns.notFiled')}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Return Details */}
          <Card>
            <CardHeader>
              <CardTitle>{t('returns.detail.returnInfo')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-muted-foreground">
                    {t('returns.detail.returnNumber')}
                  </dt>
                  <dd className="font-medium">{vatReturn.returnNumber || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">{t('returns.detail.period')}</dt>
                  <dd className="font-medium">
                    {format(new Date(vatReturn.startDate), 'MMM d, yyyy')} -{' '}
                    {format(new Date(vatReturn.endDate), 'MMM d, yyyy')}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">{t('returns.detail.status')}</dt>
                  <dd>
                    <Badge className={getVATReturnStatusColor(vatReturn.status)}>
                      {getVATReturnStatusLabel(vatReturn.status)}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">
                    {t('returns.detail.createdDate')}
                  </dt>
                  <dd className="font-medium">
                    {format(new Date(vatReturn.createdAt), 'MMM d, yyyy')}
                  </dd>
                </div>
                {vatReturn.submittedAt && (
                  <div>
                    <dt className="text-sm text-muted-foreground">
                      {t('returns.detail.submittedDate')}
                    </dt>
                    <dd className="font-medium">
                      {format(new Date(vatReturn.submittedAt), 'MMM d, yyyy')}
                    </dd>
                  </div>
                )}
                {vatReturn.dueDate && (
                  <div>
                    <dt className="text-sm text-muted-foreground">{t('returns.detail.dueDate')}</dt>
                    <dd className="font-medium">
                      {format(new Date(vatReturn.dueDate), 'MMM d, yyyy')}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Breakdown Tab */}
        <TabsContent value="breakdown" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sales / Output VAT */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-blue-500">
                    <Receipt className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{t('returns.detail.salesBreakdown')}</CardTitle>
                    <CardDescription>{t('returns.detail.totalSales')}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b">
                    <span className="text-sm text-muted-foreground">
                      {t('returns.detail.totalSales')}
                    </span>
                    <span className="font-mono font-semibold">
                      {formatCurrency(vatReturn.totalSales)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-sm font-medium">{t('returns.outputVat')}</span>
                    <span className="font-mono font-bold text-lg">
                      {formatCurrency(vatReturn.outputVat)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Purchases / Input VAT */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-orange-500">
                    <ShoppingCart className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">
                      {t('returns.detail.purchasesBreakdown')}
                    </CardTitle>
                    <CardDescription>{t('returns.detail.totalPurchases')}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b">
                    <span className="text-sm text-muted-foreground">
                      {t('returns.detail.totalPurchases')}
                    </span>
                    <span className="font-mono font-semibold">
                      {formatCurrency(vatReturn.totalPurchases)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-sm font-medium">{t('returns.inputVat')}</span>
                    <span className="font-mono font-bold text-lg">
                      {formatCurrency(vatReturn.inputVat)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Net Summary */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('returns.netPosition')}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('returns.outputVat')}: {formatCurrency(vatReturn.outputVat)} -{' '}
                    {t('returns.inputVat')}: {formatCurrency(vatReturn.inputVat)}
                  </p>
                </div>
                <div
                  className={cn(
                    'text-3xl font-bold font-mono',
                    netVat > 0 ? 'text-red-600' : 'text-green-600',
                  )}
                >
                  {formatCurrency(Math.abs(netVat))}
                  <span className="text-sm font-normal ml-2">
                    {netVat > 0 ? t('returns.netPayable') : t('returns.netRefundable')}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Tab */}
        <TabsContent value="payment" className="space-y-4 mt-4">
          {vatReturn.payment ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-green-500">
                    <CheckCircle2 className="h-4 w-4 text-white" />
                  </div>
                  <CardTitle>{t('returns.detail.paymentDetails')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm text-muted-foreground">
                      {t('returns.detail.paymentAmount')}
                    </dt>
                    <dd className="text-xl font-bold font-mono">
                      {formatCurrency(vatReturn.payment.amount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">
                      {t('returns.detail.paymentDate')}
                    </dt>
                    <dd className="font-medium">
                      {format(
                        new Date(
                          vatReturn.payment.date ||
                            vatReturn.payment.paymentDate ||
                            vatReturn.payment.createdAt,
                        ),
                        'MMM d, yyyy',
                      )}
                    </dd>
                  </div>
                  {vatReturn.payment.reference && (
                    <div>
                      <dt className="text-sm text-muted-foreground">
                        {t('returns.detail.paymentReference')}
                      </dt>
                      <dd className="font-medium">{vatReturn.payment.reference}</dd>
                    </div>
                  )}
                </dl>
                <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="font-medium">{t('returns.detail.journalEntry')}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('returns.detail.journalEntryDesc')}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <CreditCard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t('returns.detail.noPayment')}</h3>
                {canPay && (
                  <Button
                    onClick={() => {
                      setPaymentAmount(exactPayable);
                      setPaymentDialogOpen(true);
                    }}
                    className="mt-4"
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    {t('returns.recordPayment')}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* File Confirmation */}
      <AlertDialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('returns.fileTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('returns.fileDescriptionDetail')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFile}>{t('returns.fileReturn')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('payments.recordTitle')}</DialogTitle>
            <DialogDescription>{t('payments.recordDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="paymentAmount">{t('payments.amount')}</Label>
              <Input id="paymentAmount" inputMode="decimal" value={paymentAmount} readOnly />
              <p className="text-xs text-muted-foreground">{t('payments.exactAmountHint')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paidFrom">{t('payments.paidFrom')}</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger id="paidFrom">
                  <SelectValue
                    placeholder={
                      accountsLoading ? tCommon('table.loading') : t('payments.paidFromPlaceholder')
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {paidFromOptions.length === 0 && !accountsLoading ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      {accountsError
                        ? t('payments.paidFromLoadError')
                        : t('payments.noPaidFromAccounts')}
                    </div>
                  ) : (
                    paidFromOptions.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentDate">{t('payments.paymentDate')}</Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentRef">{t('payments.reference')}</Label>
              <Input
                id="paymentRef"
                placeholder={t('payments.referencePlaceholder')}
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              {tCommon('buttons.cancel')}
            </Button>
            <Button
              onClick={handleRecordPayment}
              disabled={createPayment.isPending || !paymentAmount || !bankAccountId}
            >
              {createPayment.isPending ? t('payments.recording') : t('payments.recordButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('returns.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('returns.deleteDescriptionShort')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              {tCommon('buttons.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
