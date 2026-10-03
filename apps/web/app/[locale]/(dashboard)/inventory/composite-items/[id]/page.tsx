'use client';

import { useDocumentMoney } from '@/lib/hooks/use-organization';
import { CompositeItemForm } from '@/components/inventory/composite-item-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { warehousesApi } from '@/lib/api';
import {
  useAssembleCompositeItem,
  useCheckAvailability,
  useCompositeItem,
  useUpdateCompositeItem,
} from '@/lib/hooks/use-composite-items';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle, Package, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function CompositeItemDetailContent() {
  const money = useDocumentMoney();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;
  const isEditing = searchParams.get('edit') === 'true';

  const { data: compositeItem, isLoading } = useCompositeItem(id);
  const updateCompositeItem = useUpdateCompositeItem();
  const assembleCompositeItem = useAssembleCompositeItem();

  const [checkQuantity, setCheckQuantity] = useState<number>(1);
  const [showAvailability, setShowAvailability] = useState(false);
  const [assembleQuantity, setAssembleQuantity] = useState<string>('1');
  const [assembleWarehouseId, setAssembleWarehouseId] = useState<string>('');

  const { data: availability, refetch: refetchAvailability } = useCheckAvailability(
    showAvailability ? id : undefined,
    checkQuantity,
  );

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', 'all-for-assembly'],
    queryFn: async () => {
      const response = await warehousesApi.getAll({ limit: 100 });
      return response.data;
    },
  });

  const warehouses = warehousesData?.data || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!compositeItem) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">Composite item not found.</p>
        <Button asChild className="mt-4">
          <Link href="/inventory/composite-items">Back to list</Link>
        </Button>
      </div>
    );
  }

  if (isEditing) {
    const handleUpdate = async (data: {
      name: string;
      sku: string;
      sellingPrice: string;
      description: string;
      components: Array<{ itemId: string; quantity: string }>;
    }) => {
      await updateCompositeItem.mutateAsync({ id, data });
      router.push(`/inventory/composite-items/${id}`);
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/inventory/composite-items/${id}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Composite Item</h1>
            <p className="text-muted-foreground">Update {compositeItem.name}</p>
          </div>
        </div>
        <CompositeItemForm
          defaultValues={{
            name: compositeItem.name,
            sku: compositeItem.sku,
            sellingPrice: compositeItem.sellingPrice,
            description: compositeItem.description || '',
            components: compositeItem.components.map((c) => ({
              itemId: c.itemId,
              quantity: c.quantity,
            })),
          }}
          onSubmit={handleUpdate}
          isSubmitting={updateCompositeItem.isPending}
          submitLabel="Update Composite Item"
        />
      </div>
    );
  }

  const handleCheckAvailability = () => {
    setShowAvailability(true);
    void refetchAvailability();
  };

  const handleAssemble = async () => {
    if (!assembleWarehouseId || !assembleQuantity) return;
    await assembleCompositeItem.mutateAsync({
      id,
      data: {
        quantity: parseInt(assembleQuantity, 10),
        warehouseId: assembleWarehouseId,
      },
    });
    setAssembleQuantity('1');
    setAssembleWarehouseId('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/inventory/composite-items">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{compositeItem.name}</h1>
            <p className="text-muted-foreground font-mono">{compositeItem.sku}</p>
          </div>
        </div>
        <Button asChild>
          <Link href={`/inventory/composite-items/${id}?edit=true`}>Edit</Link>
        </Button>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sm text-muted-foreground">Selling Price</dt>
              <dd className="text-lg font-semibold">{money(compositeItem.sellingPrice)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Components</dt>
              <dd className="text-lg font-semibold">{compositeItem.components.length}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Created</dt>
              <dd className="text-sm">
                {format(new Date(compositeItem.createdAt), 'MMM d, yyyy')}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Description</dt>
              <dd className="text-sm">{compositeItem.description || 'No description'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Components Table */}
      <Card>
        <CardHeader>
          <CardTitle>Components</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compositeItem.components.map((component) => (
                <TableRow key={component.id}>
                  <TableCell className="font-medium">
                    {component.item?.name || component.itemId}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{component.item?.sku || '-'}</TableCell>
                  <TableCell>{component.item?.unit || '-'}</TableCell>
                  <TableCell className="text-right font-mono">{component.quantity}</TableCell>
                </TableRow>
              ))}
              {compositeItem.components.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No components configured.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Availability Check */}
      <Card>
        <CardHeader>
          <CardTitle>Check Availability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="space-y-2">
              <Label>Quantity to check</Label>
              <Input
                type="number"
                min="1"
                value={checkQuantity}
                onChange={(e) => setCheckQuantity(parseInt(e.target.value, 10) || 1)}
                className="w-32"
              />
            </div>
            <Button onClick={handleCheckAvailability} variant="outline">
              Check
            </Button>
          </div>

          {showAvailability && availability && (
            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center gap-2">
                {availability.available ? (
                  <Badge className="bg-green-100 text-green-800 gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Available
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800 gap-1">
                    <XCircle className="h-3 w-3" />
                    Insufficient Stock
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  Max assemblable: {availability.maxAssemblyQuantity}
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead className="text-right">Required</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availability.components?.map((comp) => (
                    <TableRow key={comp.itemId}>
                      <TableCell>{comp.itemName}</TableCell>
                      <TableCell className="text-right font-mono">{comp.required}</TableCell>
                      <TableCell className="text-right font-mono">{comp.available}</TableCell>
                      <TableCell className="text-center">
                        {comp.sufficient ? (
                          <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600 mx-auto" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assemble */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Assemble
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min="1"
                value={assembleQuantity}
                onChange={(e) => setAssembleQuantity(e.target.value)}
                className="w-32"
              />
            </div>
            <div className="space-y-2">
              <Label>Warehouse</Label>
              <Select value={assembleWarehouseId} onValueChange={setAssembleWarehouseId}>
                <SelectTrigger className="w-60">
                  <SelectValue placeholder="Select warehouse..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((wh: { id: string; name: string }) => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleAssemble}
              disabled={
                !assembleWarehouseId || !assembleQuantity || assembleCompositeItem.isPending
              }
            >
              {assembleCompositeItem.isPending ? 'Assembling...' : 'Assemble'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CompositeItemDetailPage() {
  return (
    <Suspense>
      <CompositeItemDetailContent />
    </Suspense>
  );
}
