'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskForm } from '@/components/projects/task-form';
import { useProject, useCreateTask } from '@/lib/hooks/use-projects';

interface NewTaskPageProps {
  params: Promise<{ id: string }>;
}

export default function NewTaskPage({ params }: NewTaskPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: project, isLoading } = useProject(id);
  const createTask = useCreateTask();

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await createTask.mutateAsync({ projectId: id, data });
      router.push(`/projects/${id}`);
    } catch (error) {
      // Error handled by mutation
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/projects/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Task</h1>
          <p className="text-muted-foreground">Add a task to {project.name}</p>
        </div>
      </div>

      <TaskForm
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/projects/${id}`)}
        isSubmitting={createTask.isPending}
      />
    </div>
  );
}
