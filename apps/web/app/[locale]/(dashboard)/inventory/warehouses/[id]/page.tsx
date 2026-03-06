'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2, MapPin, Package, Star, ArrowRightLeft } from 'lucide-react';
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
  AlertDialogTrigger,
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
import { WarehouseForm } from '@/components/inventory/warehouse-form';
import {
  useWarehouse,
  useWarehouseStock,
  useUpdateWarehouse,
  useDeleteWarehouse,
  formatWarehouseAddress,
} from '@/lib/hooks/use-warehouses';

interface WarehouseDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function WarehouseDetailPage({ params }: WarehouseDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditing = searchParams.get('edit') === 'true';

  const { data: warehouse, isLoading } = useWarehouse(id);
  const { data: stock, isLoading: stockLoading } = useWarehouseStock(id);
  const updateWarehouse = useUpdateWarehouse();
  const deleteWarehouse = useDeleteWarehouse();

  const [editDialogOpen, setEditDialogOpen] = useState(isEditing);

  const handleUpdate = async (data: Record<string, unknown>) => {
    await updateWarehouse.mutateAsync({ id, data });
    setEditDialogOpen(false);
    router.replace(`/inventory/warehouses/${id}`);
  };

  const handleDelete = async () => {
    await deleteWarehouse.mutateAsync(id);
    router.push('/inventory/warehouses');
  };

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

  if (!warehouse) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Warehouse not found</p>
        <Button asChild className="mt-4">
          <Link href="/inventory/warehouses">Back to Warehouses</Link>
        </Button>
      </div>
    );
  }

  const totalItems = stock?.length || 0;
  const totalQuantity = stock?.reduce((sum, s) => sum + s.quantity, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/inventory/warehouses">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{warehouse.name}</h1>
              {warehouse.isDefault && (
                <Badge variant="outline" className="gap-1">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  Default
                </Badge>
              )}
              <Badge variant={warehouse.isActive ? 'default' : 'secondary'}>
                {warehouse.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            {warehouse.code && <p className="text-muted-foreground font-mono">{warehouse.code}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/inventory/transfers/new?from=${id}`}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Transfer Stock
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Warehouse</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this warehouse? Warehouses with stock cannot be
                  deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unique Items</p>
                <p className="text-2xl font-bold">{totalItems}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Package className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Quantity</p>
                <p className="text-2xl font-bold">{totalQuantity}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <MapPin className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Location</p>
                <p className="text-sm font-medium truncate max-w-[200px]">
                  {formatWarehouseAddress(warehouse)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stock Levels */}
      <Card>
        <CardHeader>
          <CardTitle>Stock Levels</CardTitle>
        </CardHeader>
        <CardContent>
          {stockLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !stock || stock.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No items in this warehouse
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.map((s) => (
                  <TableRow key={s.itemId}>
                    <TableCell>
                      <Link
                        href={`/inventory/items/${s.itemId}`}
                        className="font-medium hover:text-blue-600 hover:underline"
                      >
                        {s.item.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{s.item.sku || '-'}</TableCell>
                    <TableCell className="text-right font-mono font-medium">{s.quantity}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {s.item.unit || 'units'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Warehouse</DialogTitle>
            <DialogDescription>Update warehouse details below.</DialogDescription>
          </DialogHeader>
          <WarehouseForm
            warehouse={warehouse}
            onSubmit={handleUpdate}
            onCancel={() => setEditDialogOpen(false)}
            isSubmitting={updateWarehouse.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
