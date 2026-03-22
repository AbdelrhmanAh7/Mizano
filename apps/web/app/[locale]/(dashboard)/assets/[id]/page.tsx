'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAsset,
  useDeleteAsset,
  useDisposeAsset,
  useDepreciationSchedule,
  getAssetTypeLabel,
  getAssetStatusColor,
  getAssetStatusLabel,
  getDepreciationMethodLabel,
  formatCurrency,
  calculateRemainingLife,
} from '@/lib/hooks/use-assets';
import { useTranslations } from 'next-intl';

interface AssetDetailPageProps {
  params: { id: string };
}

export default function AssetDetailPage({ params }: AssetDetailPageProps) {
  const { id } = params;
  const t = useTranslations('assets');
  const tc = useTranslations('common');
  const router = useRouter();
  const { data: asset, isLoading } = useAsset(id);
  const { data: scheduleData } = useDepreciationSchedule(id);
  const deleteAsset = useDeleteAsset();
  const disposeAsset = useDisposeAsset();

  const [disposeOpen, setDisposeOpen] = useState(false);
  const [disposalAmount, setDisposalAmount] = useState('');
  const [disposalDate, setDisposalDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const schedule = scheduleData?.data || scheduleData || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('assetNotFound')}</p>
        <Button asChild className="mt-4">
          <Link href="/assets">{t('backToAssets')}</Link>
        </Button>
      </div>
    );
  }

  const handleDelete = async () => {
    await deleteAsset.mutateAsync(asset.id);
    router.push('/assets');
  };

  const handleDispose = async () => {
    await disposeAsset.mutateAsync({
      id: asset.id,
      data: {
        disposalDate,
        disposalAmount: parseFloat(disposalAmount),
      },
    });
    setDisposeOpen(false);
  };

  const depreciationProgress =
    asset.purchasePrice > 0 ? (asset.accumulatedDepreciation / asset.purchasePrice) * 100 : 0;

  const remainingMonths = calculateRemainingLife(asset);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/assets">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{asset.name}</h1>
              <Badge variant="outline" className={getAssetStatusColor(asset.status)}>
                {getAssetStatusLabel(asset.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {asset.assetNumber} - {getAssetTypeLabel(asset.assetType)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {asset.status === 'ACTIVE' && (
            <Dialog open={disposeOpen} onOpenChange={setDisposeOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">{t('detail.disposeAsset')}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('detail.disposeAsset')}</DialogTitle>
                  <DialogDescription>{t('detail.disposeDescription')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('detail.disposalDate')}</Label>
                    <Input
                      type="date"
                      value={disposalDate}
                      onChange={(e) => setDisposalDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('detail.disposalAmount')}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={disposalAmount}
                      onChange={(e) => setDisposalAmount(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('detail.currentBookValueLabel', {
                        value: formatCurrency(asset.currentBookValue),
                      })}
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDisposeOpen(false)}>
                    {tc('buttons.cancel')}
                  </Button>
                  <Button onClick={handleDispose} disabled={disposeAsset.isPending}>
                    {disposeAsset.isPending ? t('detail.processing') : t('detail.dispose')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {asset.status === 'ACTIVE' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
                  {tc('buttons.delete')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('confirmDelete.title')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('confirmDelete.descriptionDetail')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tc('buttons.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                    {tc('buttons.delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('detail.purchasePrice')}</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(asset.purchasePrice)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('detail.currentBookValue')}</p>
            <p className="text-2xl font-bold font-mono text-green-600">
              {formatCurrency(asset.currentBookValue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('detail.depreciation')}</p>
            <p className="text-lg font-bold">{depreciationProgress.toFixed(0)}%</p>
            <Progress value={depreciationProgress} className="h-2 mt-1" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('detail.remainingLife')}</p>
            <p className="text-2xl font-bold">{t('detail.months', { count: remainingMonths })}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('assetDetails')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('detail.purchaseDate')}</span>
              <span>{format(new Date(asset.purchaseDate), 'MMM d, yyyy')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('detail.usefulLife')}</span>
              <span>{t('detail.years', { count: asset.usefulLifeYears })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('detail.depreciationMethod')}</span>
              <span>{getDepreciationMethodLabel(asset.depreciationMethod)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('detail.salvageValue')}</span>
              <span className="font-mono">{formatCurrency(asset.salvageValue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('detail.monthlyDepreciation')}</span>
              <span className="font-mono">{formatCurrency(asset.monthlyDepreciation)}</span>
            </div>
            {asset.description && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground mb-1">{t('detail.description')}</p>
                <p className="text-sm">{asset.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('detail.financialSummary')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('detail.purchasePrice')}</span>
              <span className="font-mono">{formatCurrency(asset.purchasePrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('detail.accumulatedDepreciation')}</span>
              <span className="font-mono text-red-600">
                ({formatCurrency(asset.accumulatedDepreciation)})
              </span>
            </div>
            <div className="flex justify-between font-bold border-t pt-2">
              <span>{t('detail.netBookValue')}</span>
              <span className="font-mono">{formatCurrency(asset.currentBookValue)}</span>
            </div>
            {asset.disposalDate && (
              <>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-muted-foreground">{t('detail.disposalDate')}</span>
                  <span>{format(new Date(asset.disposalDate), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('detail.disposalAmount')}</span>
                  <span className="font-mono">{formatCurrency(asset.disposalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('detail.gainLoss')}</span>
                  <span
                    className={`font-mono ${(asset.disposalGainLoss || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {formatCurrency(asset.disposalGainLoss)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {Array.isArray(schedule) && schedule.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('schedule.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('schedule.period')}</TableHead>
                  <TableHead className="text-right">{t('schedule.amount')}</TableHead>
                  <TableHead className="text-right">{t('schedule.accumulated')}</TableHead>
                  <TableHead className="text-right">{t('schedule.bookValue')}</TableHead>
                  <TableHead>{t('schedule.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.map(
                  (item: {
                    id: string;
                    year: number;
                    month: number;
                    amount: number;
                    accumulatedTotal: number;
                    bookValue: number;
                    executedAt?: string | null;
                  }) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {format(new Date(item.year, item.month - 1), 'MMM yyyy')}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(item.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(item.accumulatedTotal)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(item.bookValue)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            item.executedAt
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }
                        >
                          {item.executedAt ? t('schedule.posted') : t('schedule.pending')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
