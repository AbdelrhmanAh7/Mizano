'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { ArrowLeft, CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useCreateTimesheet, useProjects, useTasks } from '@/lib/hooks/use-projects';

const timesheetSchema = z.object({
  projectId: z.string().min(1, 'Project is required'),
  taskId: z.string().min(1, 'Task is required'),
  date: z.date({ required_error: 'Date is required' }),
  hours: z.number().min(0.1, 'Hours must be at least 0.1'),
  description: z.string().optional(),
});

type TimesheetFormData = z.infer<typeof timesheetSchema>;

export default function NewTimesheetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get('projectId') || '';

  const createTimesheet = useCreateTimesheet();
  const { data: projectsData, isLoading: projectsLoading } = useProjects({ status: 'ACTIVE' });

  const form = useForm<TimesheetFormData>({
    resolver: zodResolver(timesheetSchema),
    defaultValues: {
      projectId: initialProjectId,
      taskId: '',
      date: new Date(),
      hours: 1,
      description: '',
    },
  });

  const selectedProjectId = form.watch('projectId');
  const { data: tasksData, isLoading: tasksLoading } = useTasks(selectedProjectId);

  const projects = projectsData?.data || [];
  const tasks = tasksData?.data || [];

  const handleSubmit = async (data: TimesheetFormData) => {
    try {
      await createTimesheet.mutateAsync({
        ...data,
        date: format(data.date, 'yyyy-MM-dd'),
      });
      router.push('/projects/timesheets');
    } catch (error) {
      // Error handled by mutation
    }
  };

  if (projectsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/projects/timesheets">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Log Time</h1>
          <p className="text-muted-foreground">
            Record time spent on a project task
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Time Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Project *</Label>
                <Select
                  value={form.watch('projectId') || ''}
                  onValueChange={(value) => {
                    form.setValue('projectId', value);
                    form.setValue('taskId', ''); // Reset task when project changes
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project: any) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.projectId && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.projectId.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Task *</Label>
                <Select
                  value={form.watch('taskId') || ''}
                  onValueChange={(value) => form.setValue('taskId', value)}
                  disabled={!selectedProjectId || tasksLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tasksLoading ? 'Loading...' : 'Select task'} />
                  </SelectTrigger>
                  <SelectContent>
                    {tasks.map((task: any) => (
                      <SelectItem key={task.id} value={task.id}>
                        {task.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.taskId && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.taskId.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !form.watch('date') && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.watch('date')
                        ? format(form.watch('date'), 'PPP')
                        : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.watch('date')}
                      onSelect={(date) => date && form.setValue('date', date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hours">Hours *</Label>
                <Input
                  id="hours"
                  type="number"
                  step="0.25"
                  min="0.1"
                  placeholder="1.0"
                  {...form.register('hours', { valueAsNumber: true })}
                />
                {form.formState.errors.hours && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.hours.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="What did you work on?"
                {...form.register('description')}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={createTimesheet.isPending}>
            {createTimesheet.isPending ? 'Saving...' : 'Log Time'}
          </Button>
        </div>
      </form>
    </div>
  );
}
