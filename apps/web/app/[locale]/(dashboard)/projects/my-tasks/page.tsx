'use client';

import { CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useMyTasks,
  useUpdateTask,
  getTaskStatusLabel,
  getTaskStatusColor,
  taskStatusOptions,
  type Task,
  type TaskStatus,
} from '@/lib/hooks/use-projects';

const GROUPS: { status: TaskStatus; label: string }[] = [
  { status: 'TODO', label: 'To Do' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'REVIEW', label: 'In Review' },
];

export default function MyTasksPage() {
  const { data: tasks, isLoading } = useMyTasks();
  const updateTask = useUpdateTask();

  const allTasks: Task[] = Array.isArray(tasks) ? tasks : tasks?.data || [];

  const handleStatusChange = async (task: Task, newStatus: TaskStatus) => {
    await updateTask.mutateAsync({
      taskId: task.id,
      projectId: task.projectId,
      data: { status: newStatus },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Tasks</h1>
        <p className="text-muted-foreground">Tasks assigned to you across all projects</p>
      </div>

      {allTasks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-1">All caught up!</h3>
            <p className="text-muted-foreground">No tasks assigned to you right now.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {GROUPS.map(({ status, label }) => {
            const groupTasks = allTasks.filter((t) => t.status === status);
            if (groupTasks.length === 0) return null;
            return (
              <Card key={status}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Badge className={getTaskStatusColor(status)}>{label}</Badge>
                    <span className="text-muted-foreground font-normal text-sm">
                      {groupTasks.length} task{groupTasks.length !== 1 ? 's' : ''}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {groupTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{task.name}</p>
                        {task.dueDate && (
                          <p className="text-xs text-muted-foreground">
                            Due {new Date(task.dueDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <Select
                        value={task.status}
                        onValueChange={(v) => void handleStatusChange(task, v as TaskStatus)}
                      >
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {taskStatusOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value} className="text-xs">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
