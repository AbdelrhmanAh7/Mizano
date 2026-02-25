'use client';

import { useState } from 'react';
import { Phone, Mail, Users, FileText, CheckSquare, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useLeadActivities,
  useDealActivities,
  useCreateActivity,
  ActivityLog as ActivityLogType,
  ActivityType,
  getActivityTypeLabel,
} from '@/lib/hooks/use-crm';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';

const ACTIVITY_TYPES: ActivityType[] = ['CALL', 'EMAIL', 'MEETING', 'NOTE', 'TASK'];

const activityIcons: Record<ActivityType, React.ReactNode> = {
  CALL: <Phone className="h-4 w-4" />,
  EMAIL: <Mail className="h-4 w-4" />,
  MEETING: <Users className="h-4 w-4" />,
  NOTE: <FileText className="h-4 w-4" />,
  TASK: <CheckSquare className="h-4 w-4" />,
};

const activityColors: Record<ActivityType, string> = {
  CALL: 'bg-blue-100 text-blue-700',
  EMAIL: 'bg-purple-100 text-purple-700',
  MEETING: 'bg-green-100 text-green-700',
  NOTE: 'bg-yellow-100 text-yellow-700',
  TASK: 'bg-orange-100 text-orange-700',
};

interface ActivityLogProps {
  leadId?: string;
  dealId?: string;
}

export function ActivityLog({ leadId, dealId }: ActivityLogProps) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType>('NOTE');
  const [description, setDescription] = useState('');

  const { data: leadActivitiesData } = useLeadActivities(leadId || '', 50);
  const { data: dealActivitiesData } = useDealActivities(dealId || '', 50);
  const createActivity = useCreateActivity();

  const activities: ActivityLogType[] = leadId
    ? leadActivitiesData?.data || []
    : dealActivitiesData?.data || [];

  const handleSubmit = async () => {
    if (!description.trim()) return;

    try {
      await createActivity.mutateAsync({
        leadId: leadId || undefined,
        dealId: dealId || undefined,
        type: activityType,
        description: description.trim(),
      });
      toast({ title: 'Activity added' });
      setDescription('');
      setShowForm(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to add activity',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Activities</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Activity
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Activity Form */}
        {showForm && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/50">
            <div className="flex gap-3">
              <Select
                value={activityType}
                onValueChange={(v) => setActivityType(v as ActivityType)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      <span className="flex items-center gap-2">
                        {activityIcons[type]}
                        {getActivityTypeLabel(type)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              placeholder="Describe the activity..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setDescription('');
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={createActivity.isPending || !description.trim()}
              >
                {createActivity.isPending ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </div>
        )}

        {/* Activity Timeline */}
        {activities.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">No activities yet</div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <div key={activity.id} className="flex gap-3 items-start">
                <div className={`rounded-full p-2 ${activityColors[activity.type]}`}>
                  {activityIcons[activity.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {getActivityTypeLabel(activity.type)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(activity.date || activity.createdAt), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>
                  {activity.user && (
                    <span className="text-xs text-muted-foreground">by {activity.user.name}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
