'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DollarSign, User, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useDeals,
  useUpdateDealStage,
  Deal,
  DealStage,
  getDealStageLabel,
  getDealStageColor,
  formatCurrency,
} from '@/lib/hooks/use-crm';
import { useToast } from '@/components/ui/use-toast';

const STAGES: DealStage[] = [
  'NEW',
  'MEETING_SCHEDULED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
];

interface KanbanBoardProps {
  deals: Deal[];
}

export function KanbanBoard({ deals }: KanbanBoardProps) {
  const { toast } = useToast();
  const updateStage = useUpdateDealStage();
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);

  const dealsByStage: Record<string, Deal[]> = {};
  STAGES.forEach((stage) => {
    dealsByStage[stage] = deals.filter((d) => d.stage === stage);
  });

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    setDraggedDeal(dealId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, stage: DealStage) => {
    e.preventDefault();
    if (!draggedDeal) return;

    const deal = deals.find((d) => d.id === draggedDeal);
    if (!deal || deal.stage === stage) {
      setDraggedDeal(null);
      return;
    }

    try {
      await updateStage.mutateAsync({ id: draggedDeal, stage });
      toast({ title: `Deal moved to ${getDealStageLabel(stage)}` });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update stage',
        variant: 'destructive',
      });
    }
    setDraggedDeal(null);
  };

  const getDaysInStage = (deal: Deal): number => {
    const created = new Date(deal.updatedAt || deal.createdAt);
    const now = new Date();
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getStageTotal = (stage: DealStage): number => {
    return dealsByStage[stage]?.reduce((sum, d) => sum + d.expectedAmount, 0) || 0;
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STAGES.map((stage) => (
        <div
          key={stage}
          className="flex-shrink-0 w-[280px]"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, stage)}
        >
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{getDealStageLabel(stage)}</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {dealsByStage[stage]?.length || 0}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {formatCurrency(getStageTotal(stage))}
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <ScrollArea className="h-[calc(100vh-350px)]">
                <div className="space-y-2 pr-2">
                  {dealsByStage[stage]?.map((deal) => (
                    <Link
                      key={deal.id}
                      href={`/crm/deals/${deal.id}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, deal.id)}
                      className="block"
                    >
                      <Card className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
                        <CardContent className="p-3 space-y-2">
                          <div className="font-medium text-sm truncate">{deal.dealName}</div>
                          <div className="flex items-center gap-1 text-sm font-mono">
                            <DollarSign className="h-3 w-3 text-muted-foreground" />
                            {formatCurrency(deal.expectedAmount)}
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {deal.assignedTo?.name || 'Unassigned'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {getDaysInStage(deal)}d
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {deal.probability}% probability
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                  {(!dealsByStage[stage] || dealsByStage[stage].length === 0) && (
                    <div className="text-center py-4 text-xs text-muted-foreground">No deals</div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
