'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAssets,
  useAssetSummary,
  useDeleteAsset,
  getAssetTypeLabel,
  getAssetStatusColor,
  getAssetStatusLabel,
  getDepreciationMethodLabel,
  formatCurrency,
  AssetStatus,
  AssetType,
} from '@/lib/hooks/use-assets';
import { useTranslations } from 'next-intl';

export default function AssetsPage() {
  const t = useTranslations('assets');
  const tc = useTranslations('common');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<AssetType | ''>('');

  const { data, isLoading } = useAssets({
    status: statusFilter || undefined,
    assetType: typeFilter || undefined,
  });
  const { data: summary } = useAssetSummary();
  const deleteAsset = useDeleteAsset();

  const assets = data?.data || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Button asChild>
          <Link href="/assets/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('newAsset')}
          </Link>
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{t('summary.totalAssets')}</p>
              <p className="text-2xl font-bold">{summary.totalAssets}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{t('summary.totalValue')}</p>
              <p className="text-2xl font-bold font-mono">{formatCurrency(summary.totalValue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                {t('summary.accumulatedDepreciation')}
              </p>
              <p className="text-2xl font-bold font-mono">
                {formatCurrency(summary.totalAccumulatedDepreciation)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{t('summary.netBookValue')}</p>
              <p className="text-2xl font-bold font-mono text-green-600">
                {formatCurrency(summary.totalBookValue)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex gap-4">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AssetStatus | '')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('filters.allStatus')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('filters.allStatus')}</SelectItem>
            <SelectItem value="ACTIVE">{t('status.active')}</SelectItem>
            <SelectItem value="DISPOSED">{t('status.disposed')}</SelectItem>
            <SelectItem value="FULLY_DEPRECIATED">{t('status.fullyDepreciated')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as AssetType | '')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('filters.allTypes')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('filters.allTypes')}</SelectItem>
            <SelectItem value="ELECTRONICS">{t('types.electronics')}</SelectItem>
            <SelectItem value="FURNITURE">{t('types.furniture')}</SelectItem>
            <SelectItem value="VEHICLES">{t('types.vehicles')}</SelectItem>
            <SelectItem value="MACHINERY">{t('types.machinery')}</SelectItem>
            <SelectItem value="BUILDINGS">{t('types.buildings')}</SelectItem>
            <SelectItem value="OTHER">{t('types.other')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {assets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">{t('empty.noResults')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.assetNumber')}</TableHead>
                  <TableHead>{t('table.name')}</TableHead>
                  <TableHead>{t('table.type')}</TableHead>
                  <TableHead>{t('table.method')}</TableHead>
                  <TableHead className="text-right">{t('table.purchasePrice')}</TableHead>
                  <TableHead className="text-right">{t('table.bookValue')}</TableHead>
                  <TableHead>{t('table.status')}</TableHead>
                  <TableHead className="text-right">{t('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map(
                  (asset: {
                    id: string;
                    assetNumber: string;
                    name: string;
                    assetType: string;
                    depreciationMethod: string;
                    purchasePrice: number;
                    currentBookValue: number;
                    status: string;
                  }) => (
                    <TableRow key={asset.id}>
                      <TableCell className="font-mono text-sm">{asset.assetNumber}</TableCell>
                      <TableCell>
                        <Link
                          href={`/assets/${asset.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {asset.name}
                        </Link>
                      </TableCell>
                      <TableCell>{getAssetTypeLabel(asset.assetType)}</TableCell>
                      <TableCell>{getDepreciationMethodLabel(asset.depreciationMethod)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(asset.purchasePrice)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(asset.currentBookValue)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getAssetStatusColor(asset.status)}>
                          {getAssetStatusLabel(asset.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/assets/${asset.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          {asset.status === 'ACTIVE' && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-red-600">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('confirmDelete.title')}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t('confirmDelete.description')}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{tc('buttons.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteAsset.mutate(asset.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    {tc('buttons.delete')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
