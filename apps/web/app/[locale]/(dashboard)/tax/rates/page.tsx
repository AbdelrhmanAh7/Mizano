'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, Edit, Star } from 'lucide-react';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  useTaxRates,
  useDeleteTaxRate,
  TaxRate,
  getTaxRateTypeLabel,
  formatPercentage,
} from '@/lib/hooks/use-tax';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { TaxRateForm } from '@/components/tax/tax-rate-form';

export default function TaxRatesPage() {
  const t = useTranslations('tax');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [selectedRate, setSelectedRate] = useState<TaxRate | null>(null);
  const [editingRate, setEditingRate] = useState<TaxRate | undefined>(undefined);

  const { data: taxRatesData, isLoading } = useTaxRates();
  const deleteTaxRate = useDeleteTaxRate();

  const taxRates = taxRatesData?.data || [];

  const canCreate = hasPermission('tax.create');
  const canEdit = hasPermission('tax.edit');
  const canDelete = hasPermission('tax.delete');

  const handleDelete = (rate: TaxRate) => {
    setSelectedRate(rate);
    setDeleteDialogOpen(true);
  };

  const handleEdit = (rate: TaxRate) => {
    setEditingRate(rate);
    setFormDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingRate(undefined);
    setFormDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedRate) {
      try {
        await deleteTaxRate.mutateAsync(selectedRate.id);
        toast({ title: t('rates.deleteSuccess') });
      } catch (error: unknown) {
        toast({
          title: tCommon('errors.generic'),
          description:
            (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
            t('rates.deleteFail'),
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setSelectedRate(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('rates.title')}</h1>
          <p className="text-muted-foreground">{t('rates.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {t('rates.newTaxRate')}
            </Button>
          )}
        </div>
      </div>

      {/* Tax Rates Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('rates.allRates')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : taxRates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">{t('rates.noRates')}</p>
              {canCreate && (
                <Button onClick={handleCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('rates.createFirst')}
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('rates.table.name')}</TableHead>
                  <TableHead className="text-right">{t('rates.table.rate')}</TableHead>
                  <TableHead>{t('rates.table.type')}</TableHead>
                  <TableHead>{t('rates.table.linkedAccount')}</TableHead>
                  <TableHead className="text-center">{t('rates.table.default')}</TableHead>
                  <TableHead className="text-center">{t('rates.table.active')}</TableHead>
                  <TableHead className="text-right">{t('rates.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxRates.map((rate: TaxRate) => (
                  <TableRow key={rate.id}>
                    <TableCell className="font-medium">{rate.name}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatPercentage(rate.rate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getTaxRateTypeLabel(rate.type)}</Badge>
                    </TableCell>
                    <TableCell>
                      {rate.account ? (
                        <span className="text-sm">
                          <span className="text-muted-foreground">{rate.account.code}</span>{' '}
                          {rate.account.name}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {rate.isDefault && (
                        <Star className="h-4 w-4 text-yellow-500 mx-auto fill-yellow-500" />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        className={
                          rate.isActive
                            ? 'bg-green-100 text-green-800 border-green-200'
                            : 'bg-gray-100 text-gray-800 border-gray-200'
                        }
                      >
                        {rate.isActive ? tCommon('status.active') : tCommon('status.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(rate)}
                            aria-label="Edit tax rate"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(rate)}
                            aria-label="Delete tax rate"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRate ? t('rates.editTaxRate') : t('rates.newTaxRate')}
            </DialogTitle>
            <DialogDescription>
              {editingRate ? t('rates.editDescription') : t('rates.createDescription')}
            </DialogDescription>
          </DialogHeader>
          <TaxRateForm taxRate={editingRate} onSuccess={() => setFormDialogOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rates.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('rates.deleteDescription', { name: selectedRate?.name ?? '' })}
            </AlertDialogDescription>
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
