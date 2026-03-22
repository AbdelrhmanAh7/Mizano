'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { getTaskStatusColor, type Task, type TaskStatus } from '@/lib/hooks/use-projects';

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'TODO', label: 'To Do', color: 'bg-gray-100' },
  { status: 'IN_PROGRESS', label: 'In Progress', color: 'bg-blue-100' },
  { status: 'REVIEW', label: 'In Review', color: 'bg-yellow-100' },
  { status: 'DONE', label: 'Done', color: 'bg-green-100' },
];

interface KanbanBoardProps {
  tasks: Task[];
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
}

export function KanbanBoard({ tasks, onStatusChange }: KanbanBoardProps) {
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    setDraggingId(taskId);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) onStatusChange(taskId, status);
    setDragOverColumn(null);
    setDraggingId(null);
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 min-h-[400px]">
      {COLUMNS.map(({ status, label, color }) => {
        const columnTasks = tasks.filter((t) => t.status === status);
        return (
          <div
            key={status}
            className={cn(
              'rounded-lg p-3 min-h-[300px] transition-colors',
              color,
              dragOverColumn === status && 'ring-2 ring-primary ring-offset-1',
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverColumn(status);
            }}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => handleDrop(e, status)}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{label}</h3>
              <Badge variant="secondary" className="text-xs h-5">
                {columnTasks.length}
              </Badge>
            </div>

            <div className="space-y-2">
              {columnTasks.map((task) => (
                <Card
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    'cursor-grab active:cursor-grabbing select-none',
                    draggingId === task.id && 'opacity-50',
                  )}
                >
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-sm font-medium leading-tight">{task.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="flex items-center justify-between gap-2">
                      {task.dueDate && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                      )}
                      {task.assignee && (
                        <div
                          className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium ml-auto"
                          title={`${task.assignee.firstName} ${task.assignee.lastName}`}
                        >
                          {task.assignee.firstName[0]}
                          {task.assignee.lastName[0]}
                        </div>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn('mt-2 text-xs', getTaskStatusColor(task.status))}
                    >
                      {task.isBillable ? 'Billable' : 'Non-billable'}
                    </Badge>
                  </CardContent>
                </Card>
              ))}

              {columnTasks.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-xs">No tasks</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
