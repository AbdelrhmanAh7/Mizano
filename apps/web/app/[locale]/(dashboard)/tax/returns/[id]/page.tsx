'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  FileCheck,
  Trash2,
  DollarSign,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  useDeleteVATReturn,
  useRecordVATPayment,
  getVATReturnStatusColor,
  getVATReturnStatusLabel,
  formatCurrency,
} from '@/lib/hooks/use-tax';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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

  const { data: vatReturn, isLoading } = useVATReturn(returnId);
  const fileReturn = useFileVATReturn();
  const deleteReturn = useDeleteVATReturn();
  const createPayment = useRecordVATPayment();

  const canEdit = hasPermission('tax.edit');
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
        amount: parseFloat(paymentAmount),
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
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
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
  const isFiled = vatReturn.status === 'FILED';

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
              <h1 className="text-3xl font-bold tracking-tight">{t('returns.vatReturn')}</h1>
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
          {canEdit && isDraft && (
            <Button onClick={() => setFileDialogOpen(true)}>
              <FileCheck className="mr-2 h-4 w-4" />
              {t('returns.fileReturn')}
            </Button>
          )}
          {canEdit && isFiled && (
            <Button
              onClick={() => {
                setPaymentAmount(String(netVat > 0 ? netVat : 0));
                setPaymentDialogOpen(true);
              }}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {t('returns.recordPayment')}
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
            <div className="text-2xl font-bold font-mono">{formatCurrency(vatReturn.inputVat)}</div>
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
              <Input
                id="paymentAmount"
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
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
              disabled={createPayment.isPending || !paymentAmount}
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
