'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Plus, FileText, Trash2, Upload } from 'lucide-react';
import { ImportWizard } from '@/components/import/import-wizard';
import type { ImportEntityType } from '@/lib/hooks/use-import-export';
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
  useDeliveryChallans,
  useDeleteDeliveryChallan,
  useIssueChallan,
  getChallanStatusLabel,
  getChallanStatusColor,
  getChallanTypeLabel,
  canDeleteChallan,
  canIssueChallan,
  formatDate,
  getTotalQuantity,
  ChallanStatus,
  ChallanType,
} from '@/lib/hooks/use-delivery-challans';

export default function DeliveryChallansPage() {
  const t = useTranslations('sales');
  const tCommon = useTranslations('common');
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ChallanStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<ChallanType | 'all'>('all');

  const { data, isLoading } = useDeliveryChallans({
    status: (statusFilter === 'all' ? undefined : statusFilter) as ChallanStatus | undefined,
    challanType: (typeFilter === 'all' ? undefined : typeFilter) as ChallanType | undefined,
    search: search || undefined,
  });
  const deleteChallan = useDeleteDeliveryChallan();
  const issueChallan = useIssueChallan();

  const challans = data?.data || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('deliveryChallans.title')}</h1>
          <p className="text-muted-foreground">{t('deliveryChallans.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            {t('deliveryChallans.import')}
          </Button>
          <Button asChild>
            <Link href="/sales/delivery-challans/new">
              <Plus className="mr-2 h-4 w-4" />
              {t('deliveryChallans.newChallan')}
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        <Input
          placeholder={t('deliveryChallans.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as ChallanStatus | 'all')}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t('deliveryChallans.allStatus')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('deliveryChallans.allStatus')}</SelectItem>
            <SelectItem value="DRAFT">{t('deliveryChallans.status.draft')}</SelectItem>
            <SelectItem value="ISSUED">{t('deliveryChallans.status.issued')}</SelectItem>
            <SelectItem value="RETURNED">{t('deliveryChallans.status.returned')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ChallanType | 'all')}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t('deliveryChallans.allTypes')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('deliveryChallans.allTypes')}</SelectItem>
            <SelectItem value="SUPPLY">{t('deliveryChallans.types.supply')}</SelectItem>
            <SelectItem value="JOB_WORK">{t('deliveryChallans.types.jobWork')}</SelectItem>
            <SelectItem value="SAMPLE">{t('deliveryChallans.types.sample')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {challans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {t('deliveryChallans.emptyMessage')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('deliveryChallans.table.challanNumber')}</TableHead>
                  <TableHead>{t('deliveryChallans.table.customer')}</TableHead>
                  <TableHead>{t('deliveryChallans.table.type')}</TableHead>
                  <TableHead>{t('deliveryChallans.table.date')}</TableHead>
                  <TableHead>{t('deliveryChallans.table.items')}</TableHead>
                  <TableHead>{t('deliveryChallans.table.status')}</TableHead>
                  <TableHead className="text-right">
                    {t('deliveryChallans.table.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {challans.map((challan) => (
                  <TableRow key={challan.id}>
                    <TableCell>
                      <Link
                        href={`/sales/delivery-challans/${challan.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {challan.challanNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{challan.customer?.name || '-'}</TableCell>
                    <TableCell>{getChallanTypeLabel(challan.challanType)}</TableCell>
                    <TableCell>{formatDate(challan.date)}</TableCell>
                    <TableCell>
                      {t('deliveryChallans.itemsCount', { count: getTotalQuantity(challan.lines) })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getChallanStatusColor(challan.status)}>
                        {getChallanStatusLabel(challan.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canIssueChallan(challan) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => issueChallan.mutate(challan.id)}
                          >
                            {t('deliveryChallans.issue')}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/sales/delivery-challans/${challan.id}`}>
                            <FileText className="h-4 w-4" />
                          </Link>
                        </Button>
                        {canDeleteChallan(challan) && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-red-600">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t('deliveryChallans.deleteChallan')}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t('deliveryChallans.deleteConfirmNumber', {
                                    number: challan.challanNumber,
                                  })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteChallan.mutate(challan.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  {tCommon('buttons.delete')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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

      {/* Import Wizard */}
      <ImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        entityType={'delivery_challans' as ImportEntityType}
        entityLabel="Delivery Challans"
        onComplete={() => {
          // Refetch handled by query invalidation
        }}
      />
    </div>
  );
}
