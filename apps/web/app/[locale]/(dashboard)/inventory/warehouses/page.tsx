'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Eye, MapPin, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  useWarehouses,
  useDeleteWarehouse,
  formatWarehouseAddress,
  Warehouse,
} from '@/lib/hooks/use-warehouses';

export default function WarehousesPage() {
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useWarehouses({ search });
  const deleteWarehouse = useDeleteWarehouse();

  const warehouses: Warehouse[] = data?.data || [];

  const handleDelete = async () => {
    if (deleteId) {
      await deleteWarehouse.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Warehouses</h1>
          <p className="text-muted-foreground">
            Manage your storage locations
          </p>
        </div>
        <Button asChild>
          <Link href="/inventory/warehouses/new">
            <Plus className="mr-2 h-4 w-4" />
            New Warehouse
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search warehouses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Table */}
      {warehouses.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No warehouses found</p>
          <Button asChild className="mt-4">
            <Link href="/inventory/warehouses/new">Create your first warehouse</Link>
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.map((warehouse) => (
                <TableRow key={warehouse.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/inventory/warehouses/${warehouse.id}`}
                        className="font-medium hover:text-blue-600 hover:underline"
                      >
                        {warehouse.name}
                      </Link>
                      {warehouse.isDefault && (
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {warehouse.code || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span className="truncate max-w-[200px]">
                        {formatWarehouseAddress(warehouse)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {warehouse._count?.stockLevels || 0} items
                  </TableCell>
                  <TableCell>
                    <Badge variant={warehouse.isActive ? 'default' : 'secondary'}>
                      {warehouse.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/inventory/warehouses/${warehouse.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Stock
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/inventory/warehouses/${warehouse.id}?edit=true`}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => setDeleteId(warehouse.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Warehouse</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this warehouse? This action cannot
              be undone. Warehouses with stock cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
