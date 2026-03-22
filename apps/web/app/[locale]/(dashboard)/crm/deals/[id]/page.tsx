'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Trash2,
  Trophy,
  XCircle,
  DollarSign,
  Target,
  Calendar,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  useDeal,
  useDeleteDeal,
  useUpdateDealStage,
  useMarkDealWon,
  useMarkDealLost,
  DealStage,
  getDealStageColor,
  getDealStageLabel,
  formatCurrency,
} from '@/lib/hooks/use-crm';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { ActivityLog } from '@/components/crm/activity-log';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

const STAGE_ORDER: DealStage[] = [
  'NEW',
  'MEETING_SCHEDULED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
];

const LOST_REASONS = [
  'Price too high',
  'Went with competitor',
  'No budget',
  'No decision maker',
  'Timing not right',
  'Product not a fit',
  'Other',
];

export default function DealDetailPage() {
  const t = useTranslations('crm');
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const dealId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [wonDialogOpen, setWonDialogOpen] = useState(false);
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [newStage, setNewStage] = useState<DealStage>('NEW');

  const { data: deal, isLoading } = useDeal(dealId);
  const deleteDeal = useDeleteDeal();
  const updateStage = useUpdateDealStage();
  const markWon = useMarkDealWon();
  const markLost = useMarkDealLost();

  const canEdit = hasPermission('crm.edit');
  const canDelete = hasPermission('crm.delete');

  const confirmDelete = async () => {
    try {
      await deleteDeal.mutateAsync(dealId);
      toast({ title: 'Deal deleted' });
      router.push('/crm/deals');
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to delete deal',
        variant: 'destructive',
      });
    }
    setDeleteDialogOpen(false);
  };

  const handleMarkWon = async () => {
    try {
      await markWon.mutateAsync({ id: dealId });
      toast({ title: 'Deal marked as won!' });
      setWonDialogOpen(false);
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to mark deal as won',
        variant: 'destructive',
      });
    }
  };

  const handleMarkLost = async () => {
    if (!lostReason) return;
    try {
      await markLost.mutateAsync({ id: dealId, reason: lostReason });
      toast({ title: 'Deal marked as lost' });
      setLostDialogOpen(false);
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to mark deal as lost',
        variant: 'destructive',
      });
    }
  };

  const handleStageChange = async () => {
    try {
      await updateStage.mutateAsync({ id: dealId, stage: newStage });
      toast({ title: `Deal moved to ${getDealStageLabel(newStage)}` });
      setStageDialogOpen(false);
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to update stage',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/crm/deals">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">{t('deals.dealDetails')}</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">This deal doesn&apos;t exist.</p>
            <Button asChild className="mt-4">
              <Link href="/crm/deals">Back to Deals</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isWon = deal.stage === 'WON';
  const isLost = deal.stage === 'LOST';
  const isActive = !isWon && !isLost;
  const currentStageIndex = STAGE_ORDER.indexOf(deal.stage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/crm/deals">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{deal.dealName}</h1>
              <Badge className={getDealStageColor(deal.stage)}>
                {getDealStageLabel(deal.stage)}
              </Badge>
            </div>
            {deal.lead && (
              <Link
                href={`/crm/leads/${deal.lead.id}`}
                className="text-muted-foreground hover:underline text-sm"
              >
                Lead: {deal.lead.leadName}
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && isActive && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setNewStage(deal.stage);
                  setStageDialogOpen(true);
                }}
              >
                Move Stage
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={() => setWonDialogOpen(true)}
              >
                <Trophy className="mr-2 h-4 w-4" />
                Won
              </Button>
              <Button
                variant="outline"
                className="text-red-600 hover:text-red-700"
                onClick={() => setLostDialogOpen(true)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Lost
              </Button>
            </>
          )}
          {canDelete && (
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t('deals.deleteDeal')}
            </Button>
          )}
        </div>
      </div>

      {/* Stage Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-1">
            {STAGE_ORDER.filter((s) => s !== 'LOST').map((stage, i) => {
              const isCurrentOrPast = currentStageIndex >= i;
              const isCurrent = deal.stage === stage;
              return (
                <div
                  key={stage}
                  className={cn(
                    'flex-1 h-2 rounded-full',
                    isCurrent ? 'bg-blue-500' : isCurrentOrPast ? 'bg-green-500' : 'bg-gray-200',
                  )}
                  title={getDealStageLabel(stage)}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            {STAGE_ORDER.filter((s) => s !== 'LOST').map((stage) => (
              <span key={stage} className="text-[10px] text-muted-foreground">
                {getDealStageLabel(stage)}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              {t('deals.form.value')}
            </div>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(deal.expectedAmount)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Target className="h-4 w-4" />
              Probability
            </div>
            <div className="text-2xl font-bold">{deal.probability}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              {t('deals.form.expectedCloseDate')}
            </div>
            <div className="text-lg font-bold">
              {deal.expectedCloseDate
                ? format(new Date(deal.expectedCloseDate), 'MMM d, yyyy')
                : 'Not set'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <User className="h-4 w-4" />
              {t('deals.form.assignedTo')}
            </div>
            <div className="text-lg font-bold">{deal.assignedTo?.name || 'Unassigned'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Lost Reason */}
      {isLost && deal.lostReason && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <span className="text-sm font-medium text-red-700">Lost reason: {deal.lostReason}</span>
          </CardContent>
        </Card>
      )}

      {/* Activities */}
      <ActivityLog dealId={dealId} />

      {/* Stage Change Dialog */}
      <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Deal Stage</DialogTitle>
            <DialogDescription>Select a new stage for this deal.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={newStage} onValueChange={(v) => setNewStage(v as DealStage)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_ORDER.filter((s) => s !== 'WON' && s !== 'LOST').map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {getDealStageLabel(stage)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStageDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStageChange} disabled={updateStage.isPending}>
              {updateStage.isPending ? 'Moving...' : 'Move'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Won Dialog */}
      <AlertDialog open={wonDialogOpen} onOpenChange={setWonDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Deal as Won</AlertDialogTitle>
            <AlertDialogDescription>
              Congratulations! This will mark the deal as won. A customer record will be created if
              one doesn&apos;t exist.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMarkWon} className="bg-green-600 hover:bg-green-700">
              Mark as Won
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lost Dialog */}
      <Dialog open={lostDialogOpen} onOpenChange={setLostDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Deal as Lost</DialogTitle>
            <DialogDescription>Please select a reason for losing this deal.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Lost Reason *</Label>
            <Select value={lostReason} onValueChange={setLostReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {reason}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLostDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMarkLost}
              disabled={markLost.isPending || !lostReason}
              className="bg-red-600 hover:bg-red-700"
            >
              {markLost.isPending ? 'Saving...' : 'Mark as Lost'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deals.deleteDeal')}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deal.dealName}&quot;? This cannot be undone.
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
