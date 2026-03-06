'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { usePriceList, useDeletePriceList } from '@/lib/hooks/use-price-lists';

export default function PriceListDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: priceList, isLoading } = usePriceList(id);
  const deletePriceList = useDeletePriceList();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!priceList) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/inventory/price-lists">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">Price List Not Found</h1>
        </div>
      </div>
    );
  }

  const handleDelete = async () => {
    await deletePriceList.mutateAsync(id);
    router.push('/inventory/price-lists');
  };

  const items = priceList.items || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/inventory/price-lists">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{priceList.name}</h1>
              <Badge variant={priceList.isActive ? 'default' : 'secondary'}>
                {priceList.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {priceList.type === 'SALES' ? 'Sales' : 'Purchase'} Price List
            </p>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
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
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {priceList.description && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">{priceList.description}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Price List Items</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              No items in this price list yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Min Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(
                  (item: {
                    id: string;
                    item?: { name?: string; sku?: string };
                    price?: string | number;
                    minQuantity?: number;
                  }) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.item?.name || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">{item.item?.sku || '-'}</TableCell>
                      <TableCell className="text-right font-mono">
                        ${parseFloat(item.price?.toString() || '0').toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">{item.minQuantity || 1}</TableCell>
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
