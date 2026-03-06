'use client';

import Link from 'next/link';
import { Plus, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { usePriceLists, useDeletePriceList } from '@/lib/hooks/use-price-lists';

export default function PriceListsPage() {
  const { data, isLoading } = usePriceLists();
  const deletePriceList = useDeletePriceList();

  const priceLists = data?.data || data || [];

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
          <h1 className="text-3xl font-bold tracking-tight">Price Lists</h1>
          <p className="text-muted-foreground">Manage pricing tiers for items</p>
        </div>
        <Button asChild>
          <Link href="/inventory/price-lists/new">
            <Plus className="mr-2 h-4 w-4" />
            New Price List
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {priceLists.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No price lists yet. Create your first price list to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {priceLists.map(
                  (pl: {
                    id: string;
                    name: string;
                    type: string;
                    isActive: boolean;
                    items?: unknown[];
                  }) => (
                    <TableRow key={pl.id}>
                      <TableCell>
                        <Link
                          href={`/inventory/price-lists/${pl.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {pl.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {pl.type === 'SALES' ? 'Sales' : 'Purchase'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={pl.isActive ? 'default' : 'secondary'}>
                          {pl.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>{pl.items?.length || 0} items</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/inventory/price-lists/${pl.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-red-600">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Price List</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure? This will permanently delete this price list.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deletePriceList.mutate(pl.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
