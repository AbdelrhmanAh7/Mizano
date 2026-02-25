'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ChallanStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<ChallanType | ''>('');

  const { data, isLoading } = useDeliveryChallans({
    status: statusFilter || undefined,
    challanType: typeFilter || undefined,
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
          <h1 className="text-3xl font-bold tracking-tight">Delivery Challans</h1>
          <p className="text-muted-foreground">Manage delivery challans for goods dispatch</p>
        </div>
        <Button asChild>
          <Link href="/sales/delivery-challans/new">
            <Plus className="mr-2 h-4 w-4" />
            New Challan
          </Link>
        </Button>
      </div>

      <div className="flex gap-4">
        <Input
          placeholder="Search challans..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as ChallanStatus | '')}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ISSUED">Issued</SelectItem>
            <SelectItem value="RETURNED">Returned</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ChallanType | '')}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Types</SelectItem>
            <SelectItem value="SUPPLY">Supply</SelectItem>
            <SelectItem value="JOB_WORK">Job Work</SelectItem>
            <SelectItem value="SAMPLE">Sample</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {challans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No delivery challans found. Create your first challan to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Challan #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                    <TableCell>{getTotalQuantity(challan.lines)} items</TableCell>
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
                            Issue
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
                                <AlertDialogTitle>Delete Challan</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete {challan.challanNumber}?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteChallan.mutate(challan.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Delete
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
    </div>
  );
}
