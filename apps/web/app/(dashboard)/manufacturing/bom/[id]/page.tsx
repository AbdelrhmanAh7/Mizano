'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Pencil, Trash2, Play, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useBOM,
  useDeleteBOM,
  getBOMStatusLabel,
  getBOMStatusColor,
  formatCurrency,
} from '@/lib/hooks/use-manufacturing';

export default function BOMDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: bom, isLoading } = useBOM(id);
  const deleteBOM = useDeleteBOM();

  const handleDelete = async () => {
    await deleteBOM.mutateAsync(id);
    router.push('/manufacturing/bom');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!bom) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">BOM not found</h2>
        <Button asChild className="mt-4">
          <Link href="/manufacturing/bom">Back to BOMs</Link>
        </Button>
      </div>
    );
  }

  const components = bom.components || [];
  const operationsCost = typeof bom.operationsCost === 'string'
    ? parseFloat(bom.operationsCost)
    : bom.operationsCost;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/manufacturing/bom">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{bom.name}</h1>
              <Badge
                variant="outline"
                className={getBOMStatusColor(bom.isActive ? 'ACTIVE' : 'INACTIVE')}
              >
                {getBOMStatusLabel(bom.isActive ? 'ACTIVE' : 'INACTIVE')}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Created {format(new Date(bom.createdAt), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/manufacturing/work-orders/new?bomId=${bom.id}`}>
              <Play className="mr-2 h-4 w-4" />
              Create Work Order
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/manufacturing/bom/${id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete BOM</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this bill of materials? This
                  action cannot be undone.
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
      </div>

      {/* Output Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Output Item</p>
                <p className="font-medium">
                  {bom.outputItem?.code} - {bom.outputItem?.name}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Output Quantity</p>
            <p className="text-2xl font-bold">{bom.outputQuantity}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Operations Cost</p>
            <p className="text-2xl font-bold font-mono">
              {formatCurrency(operationsCost)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Components */}
      <Card>
        <CardHeader>
          <CardTitle>Components ({components.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {components.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No components defined
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Code</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {components.map((component: any, index: number) => (
                  <TableRow key={component.id || index}>
                    <TableCell className="font-mono">
                      {component.itemCode || component.item?.code || '-'}
                    </TableCell>
                    <TableCell>
                      {component.itemName || component.item?.name || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {component.quantity}
                    </TableCell>
                    <TableCell>
                      {component.unit || component.item?.unit || 'pc'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Cost Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Summary (per {bom.outputQuantity} unit{bom.outputQuantity > 1 ? 's' : ''})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Material Cost</span>
              <span className="font-mono">
                {formatCurrency(0)} {/* Would be calculated from component prices */}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Operations Cost</span>
              <span className="font-mono">{formatCurrency(operationsCost)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t font-bold">
              <span>Total Cost</span>
              <span className="font-mono">{formatCurrency(operationsCost)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
