'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Plus,
  Clock,
  DollarSign,
  FileText,
  CheckCircle,
  Circle,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  useProject,
  useTasks,
  useDeleteProject,
  useUpdateTask,
  getProjectStatusLabel,
  getProjectStatusColor,
  getBillingMethodLabel,
  getTaskStatusLabel,
  getTaskStatusColor,
  formatCurrency,
  formatHours,
  Task,
} from '@/lib/hooks/use-projects';

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: project, isLoading } = useProject(id);
  const { data: tasksData } = useTasks(id);
  const deleteProject = useDeleteProject();
  const updateTask = useUpdateTask();

  const tasks: Task[] = tasksData?.data || [];

  const handleDelete = async () => {
    await deleteProject.mutateAsync(id);
    router.push('/projects');
  };

  const handleToggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === 'COMPLETED' ? 'TODO' : 'COMPLETED';
    await updateTask.mutateAsync({
      projectId: id,
      taskId: task.id,
      data: { status: newStatus },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Project not found</p>
        <Button asChild className="mt-4">
          <Link href="/projects">Back to Projects</Link>
        </Button>
      </div>
    );
  }

  const budget = typeof project.budgetAmount === 'string'
    ? parseFloat(project.budgetAmount)
    : project.budgetAmount;
  const billed = typeof project.totalBilled === 'string'
    ? parseFloat(project.totalBilled)
    : project.totalBilled;
  const progress = budget > 0 ? Math.min((billed / budget) * 100, 100) : 0;

  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
  const taskProgress = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/projects">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
              <Badge
                variant="outline"
                className={getProjectStatusColor(project.status)}
              >
                {getProjectStatusLabel(project.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {project.customer?.name} • {getBillingMethodLabel(project.billingMethod)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/projects/${id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Project</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this project? All tasks and time
                  entries will also be deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Hours</p>
                <p className="text-2xl font-bold font-mono">
                  {formatHours(project.totalHours)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Billed</p>
                <p className="text-2xl font-bold font-mono">
                  {formatCurrency(billed)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Budget Used</p>
            <p className="text-2xl font-bold">{progress.toFixed(0)}%</p>
            <Progress value={progress} className="h-2 mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Tasks Completed</p>
            <p className="text-2xl font-bold">
              {completedTasks}/{tasks.length}
            </p>
            <Progress value={taskProgress} className="h-2 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="time">Time Entries</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Tasks</CardTitle>
                <Button size="sm" asChild>
                  <Link href={`/projects/${id}/tasks/new`}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Task
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No tasks yet. Add your first task to get started.
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-4 p-4 border rounded-lg"
                    >
                      <button
                        onClick={() => handleToggleTaskStatus(task)}
                        className="flex-shrink-0"
                      >
                        {task.status === 'COMPLETED' ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                      <div className="flex-1">
                        <p
                          className={cn(
                            'font-medium',
                            task.status === 'COMPLETED' && 'line-through text-muted-foreground'
                          )}
                        >
                          {task.name}
                        </p>
                        {task.description && (
                          <p className="text-sm text-muted-foreground">
                            {task.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="outline" className={getTaskStatusColor(task.status)}>
                          {getTaskStatusLabel(task.status)}
                        </Badge>
                        {task.isBillable && (
                          <Badge variant="outline" className="bg-green-100 text-green-800">
                            Billable
                          </Badge>
                        )}
                        <span className="text-sm font-mono">
                          {formatHours(task.actualHours)}
                        </span>
                        <Button size="sm" variant="ghost">
                          <Play className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="time" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Time Entries</CardTitle>
                <Button size="sm" asChild>
                  <Link href={`/projects/timesheets/new?projectId=${id}`}>
                    <Plus className="mr-2 h-4 w-4" />
                    Log Time
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                Time entries will appear here.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Project Number</span>
                  <span className="font-mono">{project.projectNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span>{project.customer?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Billing Method</span>
                  <span>{getBillingMethodLabel(project.billingMethod)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Start Date</span>
                  <span>{format(new Date(project.startDate), 'MMM d, yyyy')}</span>
                </div>
                {project.endDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">End Date</span>
                    <span>{format(new Date(project.endDate), 'MMM d, yyyy')}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Budget & Billing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Budget Type</span>
                  <span>{project.budgetType === 'COST' ? 'Cost' : 'Hours'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Budget Amount</span>
                  <span className="font-mono">
                    {project.budgetType === 'COST'
                      ? formatCurrency(budget)
                      : formatHours(budget)}
                  </span>
                </div>
                {project.hourlyRate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hourly Rate</span>
                    <span className="font-mono">
                      {formatCurrency(project.hourlyRate)}/hr
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Billed</span>
                  <span className="font-mono text-green-600">
                    {formatCurrency(billed)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {project.description && (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{project.description}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
