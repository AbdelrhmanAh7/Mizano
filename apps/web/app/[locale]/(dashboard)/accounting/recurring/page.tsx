'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, RefreshCw, Eye, Edit, Trash2, Play, Pause, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  useRecurringProfiles,
  useDeleteRecurringProfile,
  useToggleRecurringProfile,
  RecurringProfile,
  getFrequencyLabel,
} from '@/lib/hooks/use-recurring-profiles';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { format } from 'date-fns';

export default function RecurringProfilesPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<RecurringProfile | null>(null);

  const { data: profilesData, isLoading, refetch } = useRecurringProfiles({
    search: searchQuery || undefined,
    isActive: selectedStatus === 'all' ? undefined : selectedStatus === 'active',
  });
  const deleteProfile = useDeleteRecurringProfile();
  const toggleProfile = useToggleRecurringProfile();

  const profiles = profilesData?.data || [];

  const canCreate = hasPermission('accounting.create');
  const canEdit = hasPermission('accounting.edit');
  const canDelete = hasPermission('accounting.delete');

  const handleDelete = (profile: RecurringProfile) => {
    setProfileToDelete(profile);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (profileToDelete) {
      try {
        await deleteProfile.mutateAsync(profileToDelete.id);
        toast({
          title: 'Profile deleted',
          description: `Recurring profile "${profileToDelete.name}" has been deleted.`,
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to delete recurring profile.',
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setProfileToDelete(null);
    }
  };

  const handleToggle = async (profile: RecurringProfile) => {
    try {
      await toggleProfile.mutateAsync(profile.id);
      toast({
        title: profile.isActive ? 'Profile paused' : 'Profile activated',
        description: `"${profile.name}" has been ${profile.isActive ? 'paused' : 'activated'}.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to toggle recurring profile.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recurring Journals</h1>
          <p className="text-muted-foreground">
            Automate journal entries with recurring profiles
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/accounting/recurring/new">
                <Plus className="mr-2 h-4 w-4" />
                New Profile
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
                placeholder="Search by name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Profiles</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Profiles Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recurring Profiles</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : profiles.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No recurring profiles found</p>
              {canCreate && (
                <Button asChild>
                  <Link href="/accounting/recurring/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Profile
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Next Execution</TableHead>
                  <TableHead>Auto Post</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile: RecurringProfile) => (
                  <TableRow key={profile.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{profile.name}</span>
                        {profile.description && (
                          <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                            {profile.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getFrequencyLabel(profile.frequency)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {format(new Date(profile.nextExecutionDate), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={profile.autoPost ? 'default' : 'secondary'}>
                        {profile.autoPost ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          profile.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }
                      >
                        {profile.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            •••
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/accounting/recurring/${profile.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Link>
                          </DropdownMenuItem>
                          {canEdit && (
                            <>
                              <DropdownMenuItem asChild>
                                <Link href={`/accounting/recurring/${profile.id}/edit`}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggle(profile)}>
                                {profile.isActive ? (
                                  <>
                                    <Pause className="mr-2 h-4 w-4" />
                                    Pause
                                  </>
                                ) : (
                                  <>
                                    <Play className="mr-2 h-4 w-4" />
                                    Activate
                                  </>
                                )}
                              </DropdownMenuItem>
                            </>
                          )}
                          {canDelete && (
                            <DropdownMenuItem
                              onClick={() => handleDelete(profile)}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
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
            <AlertDialogTitle>Delete Recurring Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{profileToDelete?.name}&quot;? This action
              cannot be undone. Previously created journals will not be affected.
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
