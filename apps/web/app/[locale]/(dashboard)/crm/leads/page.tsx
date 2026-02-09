'use client';

import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useToast } from '@/components/ui/use-toast';
import {
  Lead,
  LeadSource,
  LeadStatus,
  getLeadSourceLabel,
  getLeadStatusColor,
  getLeadStatusLabel,
  useDeleteLead,
  useInfiniteLeads,
} from '@/lib/hooks/use-crm';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { Eye, Plus, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'UNQUALIFIED', label: 'Unqualified' },
  { value: 'JUNK', label: 'Junk' },
];

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'FACEBOOK_ADS', label: 'Facebook Ads' },
  { value: 'GOOGLE_ADS', label: 'Google Ads' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'COLD_CALL', label: 'Cold Call' },
  { value: 'TRADE_SHOW', label: 'Trade Show' },
  { value: 'OTHER', label: 'Other' },
];

function ScoreBadge({ score }: { score?: { totalScore: number; tier: string } }) {
  if (!score) return <span className="text-muted-foreground">-</span>;

  const tierColors: Record<string, string> = {
    HOT: 'bg-red-100 text-red-800 border-red-200',
    WARM: 'bg-orange-100 text-orange-800 border-orange-200',
    COOL: 'bg-blue-100 text-blue-800 border-blue-200',
    COLD: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  return (
    <Badge className={tierColors[score.tier] || ''}>
      {score.totalScore} ({score.tier})
    </Badge>
  );
}

function LeadsPageContent() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'createdAt', mode: 'virtual' });

  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedSource, setSelectedSource] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const {
    data: leads,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteLeads({
    search: tableParams.search || undefined,
    status: selectedStatus !== 'all' ? (selectedStatus as LeadStatus) : undefined,
    source: selectedSource !== 'all' ? (selectedSource as LeadSource) : undefined,
    page: tableParams.page,
  });
  const deleteLead = useDeleteLead();

  const canCreate = hasPermission('crm.create');
  const canDelete = hasPermission('crm.delete');

  const handleDelete = (lead: Lead) => {
    setSelectedLead(lead);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedLead) {
      try {
        await deleteLead.mutateAsync(selectedLead.id);
        toast({ title: 'Lead deleted successfully' });
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to delete lead',
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setSelectedLead(null);
    }
  };

  const columns: ColumnDef<Lead>[] = [
    {
      accessorKey: 'leadName',
      header: () => (
        <SortableHeader
          label="Name"
          columnId="leadName"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <Link href={`/crm/leads/${row.original.id}`} className="font-medium hover:underline">
          {row.original.leadName}
        </Link>
      ),
    },
    {
      accessorKey: 'companyName',
      header: 'Company',
      cell: ({ row }) => row.original.companyName || '-',
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) =>
        row.original.email ? (
          <a href={`mailto:${row.original.email}`} className="text-blue-600 hover:underline">
            {row.original.email}
          </a>
        ) : (
          '-'
        ),
    },
    {
      accessorKey: 'source',
      header: 'Source',
      cell: ({ row }) => <Badge variant="outline">{getLeadSourceLabel(row.original.source)}</Badge>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge className={getLeadStatusColor(row.original.status)}>
          {getLeadStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      id: 'score',
      header: 'Score',
      cell: ({ row }) => <ScoreBadge score={row.original.score} />,
    },
    {
      id: 'assignedTo',
      header: 'Assigned To',
      cell: ({ row }) => row.original.assignedTo?.name || '-',
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const lead = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/crm/leads/${lead.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/crm/deals/new?leadId=${lead.id}`}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create Deal
                </Link>
              </DropdownMenuItem>
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleDelete(lead)} className="text-red-600">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground">Track and manage your sales leads</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/crm/leads/new">
                <Plus className="mr-2 h-4 w-4" />
                New Lead
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <DataTableSearch
              value={tableParams.search}
              onChange={tableParams.setSearch}
              placeholder="Search by name, company, or email..."
            />
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedSource} onValueChange={setSelectedSource}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((option) => (
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

      {/* Leads Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={leads}
            total={total}
            isLoading={isLoading}
            enableVirtualization
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            enableColumnResizing
            tableId="leads"
            emptyMessage="No leads found"
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/crm/leads/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Lead
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete lead &quot;{selectedLead?.leadName}&quot;? This action
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

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsPageContent />
    </Suspense>
  );
}
