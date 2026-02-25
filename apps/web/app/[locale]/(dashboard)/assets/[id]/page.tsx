'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAsset,
  useDeleteAsset,
  useDisposeAsset,
  useDepreciationSchedule,
  getAssetTypeLabel,
  getAssetStatusColor,
  getAssetStatusLabel,
  getDepreciationMethodLabel,
  formatCurrency,
  calculateRemainingLife,
} from '@/lib/hooks/use-assets';

interface AssetDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function AssetDetailPage({ params }: AssetDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: asset, isLoading } = useAsset(id);
  const { data: scheduleData } = useDepreciationSchedule(id);
  const deleteAsset = useDeleteAsset();
  const disposeAsset = useDisposeAsset();

  const [disposeOpen, setDisposeOpen] = useState(false);
  const [disposalAmount, setDisposalAmount] = useState('');
  const [disposalDate, setDisposalDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const schedule = scheduleData?.data || scheduleData || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Asset not found</p>
        <Button asChild className="mt-4">
          <Link href="/assets">Back to Assets</Link>
        </Button>
      </div>
    );
  }

  const handleDelete = async () => {
    await deleteAsset.mutateAsync(asset.id);
    router.push('/assets');
  };

  const handleDispose = async () => {
    await disposeAsset.mutateAsync({
      id: asset.id,
      data: {
        disposalDate,
        disposalAmount: parseFloat(disposalAmount),
      },
    });
    setDisposeOpen(false);
  };

  const depreciationProgress =
    asset.purchasePrice > 0 ? (asset.accumulatedDepreciation / asset.purchasePrice) * 100 : 0;

  const remainingMonths = calculateRemainingLife(asset);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/assets">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{asset.name}</h1>
              <Badge variant="outline" className={getAssetStatusColor(asset.status)}>
                {getAssetStatusLabel(asset.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {asset.assetNumber} - {getAssetTypeLabel(asset.assetType)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {asset.status === 'ACTIVE' && (
            <Dialog open={disposeOpen} onOpenChange={setDisposeOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Dispose Asset</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dispose Asset</DialogTitle>
                  <DialogDescription>
                    Record the disposal of this asset. This will create a journal entry for any gain
                    or loss.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Disposal Date</Label>
                    <Input
                      type="date"
                      value={disposalDate}
                      onChange={(e) => setDisposalDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Disposal Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={disposalAmount}
                      onChange={(e) => setDisposalAmount(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Current book value: {formatCurrency(asset.currentBookValue)}
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDisposeOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleDispose} disabled={disposeAsset.isPending}>
                    {disposeAsset.isPending ? 'Processing...' : 'Dispose'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {asset.status === 'ACTIVE' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Asset</AlertDialogTitle>
                  <AlertDialogDescription>
                    This can only be done if no depreciation entries have been posted.
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
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Purchase Price</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(asset.purchasePrice)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Current Book Value</p>
            <p className="text-2xl font-bold font-mono text-green-600">
              {formatCurrency(asset.currentBookValue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Depreciation</p>
            <p className="text-lg font-bold">{depreciationProgress.toFixed(0)}%</p>
            <Progress value={depreciationProgress} className="h-2 mt-1" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Remaining Life</p>
            <p className="text-2xl font-bold">{remainingMonths} months</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Asset Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Purchase Date</span>
              <span>{format(new Date(asset.purchaseDate), 'MMM d, yyyy')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Useful Life</span>
              <span>{asset.usefulLifeYears} years</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Depreciation Method</span>
              <span>{getDepreciationMethodLabel(asset.depreciationMethod)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Salvage Value</span>
              <span className="font-mono">{formatCurrency(asset.salvageValue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monthly Depreciation</span>
              <span className="font-mono">{formatCurrency(asset.monthlyDepreciation)}</span>
            </div>
            {asset.description && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{asset.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Financial Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Purchase Price</span>
              <span className="font-mono">{formatCurrency(asset.purchasePrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accumulated Depreciation</span>
              <span className="font-mono text-red-600">
                ({formatCurrency(asset.accumulatedDepreciation)})
              </span>
            </div>
            <div className="flex justify-between font-bold border-t pt-2">
              <span>Net Book Value</span>
              <span className="font-mono">{formatCurrency(asset.currentBookValue)}</span>
            </div>
            {asset.disposalDate && (
              <>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-muted-foreground">Disposal Date</span>
                  <span>{format(new Date(asset.disposalDate), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Disposal Amount</span>
                  <span className="font-mono">{formatCurrency(asset.disposalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gain/Loss</span>
                  <span
                    className={`font-mono ${(asset.disposalGainLoss || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {formatCurrency(asset.disposalGainLoss)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {Array.isArray(schedule) && schedule.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Depreciation Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Accumulated</TableHead>
                  <TableHead className="text-right">Book Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>{format(new Date(item.year, item.month - 1), 'MMM yyyy')}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(item.amount)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(item.accumulatedTotal)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(item.bookValue)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          item.executedAt
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }
                      >
                        {item.executedAt ? 'Posted' : 'Pending'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
