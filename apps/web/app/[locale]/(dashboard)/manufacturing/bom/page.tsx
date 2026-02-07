'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, RefreshCw, Eye, Edit, Trash2, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  useBOMs,
  useDeleteBOM,
  BOM,
  getBOMStatusColor,
  getBOMStatusLabel,
  formatCurrency,
} from '@/lib/hooks/use-manufacturing';
import { usePermissions } from '@/lib/hooks/use-permissions';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

export default function BOMListPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBOM, setSelectedBOM] = useState<BOM | null>(null);

  const { data: bomsData, isLoading, refetch } = useBOMs({
    search: searchQuery || undefined,
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
  });
  const deleteBOM = useDeleteBOM();

  const boms = bomsData?.data || [];

  const canCreate = hasPermission('manufacturing.create');
  const canEdit = hasPermission('manufacturing.edit');
  const canDelete = hasPermission('manufacturing.delete');

  const handleDelete = (bom: BOM) => {
    setSelectedBOM(bom);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedBOM) {
      try {
        await deleteBOM.mutateAsync(selectedBOM.id);
        toast({ title: 'BOM deleted successfully' });
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to delete BOM',
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setSelectedBOM(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bills of Materials</h1>
          <p className="text-muted-foreground">
            Define product recipes and component requirements
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/manufacturing/bom/new">
                <Plus className="mr-2 h-4 w-4" />
                New BOM
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* BOMs Table */}
      <Card>
        <CardHeader>
          <CardTitle>All BOMs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : boms.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No bills of materials found</p>
              {canCreate && (
                <Button asChild>
                  <Link href="/manufacturing/bom/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First BOM
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Output Item</TableHead>
                  <TableHead className="text-center">Components</TableHead>
                  <TableHead className="text-right">Operations Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {boms.map((bom: BOM) => (
                  <TableRow key={bom.id}>
                    <TableCell>
                      <Link
                        href={`/manufacturing/bom/${bom.id}`}
                        className="font-medium hover:underline"
                      >
                        {bom.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {bom.outputItem ? (
                        <span>
                          <span className="text-xs text-muted-foreground">{bom.outputItem.code}</span>
                          {' '}{bom.outputItem.name}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      {bom.components?.length || 0}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(bom.operationsCost)}
                    </TableCell>
                    <TableCell>
                      <Badge className={getBOMStatusColor(bom.status)}>
                        {getBOMStatusLabel(bom.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            ...
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/manufacturing/bom/${bom.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Link>
                          </DropdownMenuItem>
                          {canEdit && (
                            <DropdownMenuItem asChild>
                              <Link href={`/manufacturing/bom/${bom.id}`}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDelete(bom)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete BOM</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete BOM &quot;{selectedBOM?.name}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
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
