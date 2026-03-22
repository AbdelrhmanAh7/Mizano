'use client';

import { useState } from 'react';
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
  CheckCircle,
  Circle,
  Play,
  LayoutList,
  LayoutGrid,
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
  useProjectProfitability,
  useTasks,
  useTimesheets,
  useDeleteProject,
  useUpdateTask,
  useStartTimer,
  getProjectStatusLabel,
  getProjectStatusColor,
  getBillingMethodLabel,
  getTaskStatusLabel,
  getTaskStatusColor,
  formatCurrency,
  formatHours,
  type Task,
  type TaskStatus,
  type TimesheetEntry,
} from '@/lib/hooks/use-projects';
import { KanbanBoard } from '@/components/projects/kanban-board';
import { BudgetProgressCard } from '@/components/projects/budget-progress-card';
import { useTranslations } from 'next-intl';

interface ProjectDetailPageProps {
  params: { id: string };
}

export default function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = params;
  const t = useTranslations('projects');
  const router = useRouter();
  const [taskView, setTaskView] = useState<'list' | 'kanban'>('list');

  const { data: project, isLoading } = useProject(id);
  const { data: tasksData } = useTasks(id);
  const { data: timesheetsData } = useTimesheets({ projectId: id });
  const { data: profitability, isLoading: profLoading } = useProjectProfitability(id);
  const deleteProject = useDeleteProject();
  const updateTask = useUpdateTask();
  const startTimer = useStartTimer();

  const tasks: Task[] = tasksData?.data || [];
  const timeEntries: TimesheetEntry[] = timesheetsData?.data || [];

  const handleDelete = async () => {
    await deleteProject.mutateAsync(id);
    router.push('/projects');
  };

  const handleToggleTaskStatus = async (task: Task) => {
    const newStatus: TaskStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    await updateTask.mutateAsync({
      projectId: id,
      taskId: task.id,
      data: { status: newStatus },
    });
  };

  const handleKanbanStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    await updateTask.mutateAsync({
      projectId: id,
      taskId,
      data: { status: newStatus },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
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

  const budget = project.budgetAmount
    ? typeof project.budgetAmount === 'string'
      ? parseFloat(project.budgetAmount)
      : (project.budgetAmount as number)
    : 0;
  const billed =
    typeof project.totalBilled === 'string'
      ? parseFloat(project.totalBilled)
      : (project.totalBilled as number);
  const billedProgress = budget > 0 ? Math.min((billed / budget) * 100, 100) : 0;

  const completedTasks = tasks.filter((t) => t.status === 'DONE').length;
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
              <Badge variant="outline" className={getProjectStatusColor(project.status)}>
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
              {t('projects.editProject')}
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                {t('projects.deleteProject')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('projects.deleteProject')}</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this project? All tasks and time entries will also
                  be deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
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
                <p className="text-2xl font-bold font-mono">{formatHours(project.totalHours)}</p>
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
                <p className="text-2xl font-bold font-mono">{formatCurrency(billed)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Budget Used</p>
            <p className="text-2xl font-bold">{billedProgress.toFixed(0)}%</p>
            <Progress value={billedProgress} className="h-2 mt-2" />
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

      {/* Budget Card */}
      {(profitability || profLoading) && (
        <BudgetProgressCard data={profitability} isLoading={profLoading} />
      )}

      {/* Tabs */}
      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">{t('tasks.title')}</TabsTrigger>
          <TabsTrigger value="time">{t('timesheets.title')}</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t('tasks.title')}</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-md border">
                    <Button
                      variant={taskView === 'list' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="rounded-r-none border-r"
                      onClick={() => setTaskView('list')}
                    >
                      <LayoutList className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={taskView === 'kanban' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="rounded-l-none"
                      onClick={() => setTaskView('kanban')}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button size="sm" asChild>
                    <Link href={`/projects/${id}/tasks/new`}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('tasks.newTask')}
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t('tasks.empty.title')}. {t('tasks.empty.description')}.
                </div>
              ) : taskView === 'kanban' ? (
                <KanbanBoard tasks={tasks} onStatusChange={handleKanbanStatusChange} />
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-4 p-4 border rounded-lg">
                      <button
                        onClick={() => void handleToggleTaskStatus(task)}
                        className="flex-shrink-0"
                      >
                        {task.status === 'DONE' ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                      <div className="flex-1">
                        <p
                          className={cn(
                            'font-medium',
                            task.status === 'DONE' && 'line-through text-muted-foreground',
                          )}
                        >
                          {task.name}
                        </p>
                        {task.description && (
                          <p className="text-sm text-muted-foreground">{task.description}</p>
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
                        <span className="text-sm font-mono">{formatHours(task.actualHours)}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            startTimer.mutate({
                              projectId: id,
                              taskId: task.id,
                            })
                          }
                          disabled={startTimer.isPending}
                        >
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
                <CardTitle>{t('timesheets.title')}</CardTitle>
                <Button size="sm" asChild>
                  <Link href={`/projects/timesheets/new?projectId=${id}`}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('timesheets.newEntry')}
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {timeEntries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t('timesheets.empty.title')}. {t('timesheets.empty.description')}.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {timeEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{format(new Date(entry.date), 'MMM d, yyyy')}</TableCell>
                        <TableCell>{entry.task?.name || '-'}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {entry.description || '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatHours(entry.hours)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              entry.status === 'INVOICED'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }
                          >
                            {entry.status === 'INVOICED' ? 'Invoiced' : 'Unbilled'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('projects.projectDetails')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Project Number</span>
                  <span className="font-mono">{project.projectNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('projects.form.customer')}</span>
                  <span>{project.customer?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('projects.form.billingMethod')}</span>
                  <span>{getBillingMethodLabel(project.billingMethod)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('projects.form.startDate')}</span>
                  <span>
                    {project.startDate ? format(new Date(project.startDate), 'MMM d, yyyy') : '-'}
                  </span>
                </div>
                {project.endDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('projects.form.endDate')}</span>
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
                  <span className="text-muted-foreground">{t('projects.form.budgetAmount')}</span>
                  <span className="font-mono">
                    {project.budgetType === 'COST' ? formatCurrency(budget) : formatHours(budget)}
                  </span>
                </div>
                {project.hourlyRate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hourly Rate</span>
                    <span className="font-mono">{formatCurrency(project.hourlyRate)}/hr</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Billed</span>
                  <span className="font-mono text-green-600">{formatCurrency(billed)}</span>
                </div>
              </CardContent>
            </Card>

            {project.description && (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>{t('projects.form.description')}</CardTitle>
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
