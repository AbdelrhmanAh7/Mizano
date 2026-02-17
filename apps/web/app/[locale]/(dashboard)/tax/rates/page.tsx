'use client';

import { useState } from 'react';
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
        toast({ title: 'Tax rate deleted successfully' });
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to delete tax rate',
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
          <h1 className="text-3xl font-bold tracking-tight">Tax Rates</h1>
          <p className="text-muted-foreground">Manage tax rates for invoices and bills</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New Tax Rate
            </Button>
          )}
        </div>
      </div>

      {/* Tax Rates Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Tax Rates</CardTitle>
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
              <p className="text-muted-foreground mb-4">No tax rates configured</p>
              {canCreate && (
                <Button onClick={handleCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Tax Rate
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Linked Account</TableHead>
                  <TableHead className="text-center">Default</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                        {rate.isActive ? 'Active' : 'Inactive'}
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
            <DialogTitle>{editingRate ? 'Edit Tax Rate' : 'New Tax Rate'}</DialogTitle>
            <DialogDescription>
              {editingRate ? 'Update the tax rate details below.' : 'Create a new tax rate.'}
            </DialogDescription>
          </DialogHeader>
          <TaxRateForm taxRate={editingRate} onSuccess={() => setFormDialogOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tax Rate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete tax rate &quot;{selectedRate?.name}&quot;? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
