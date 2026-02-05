'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectForm } from '@/components/projects/project-form';
import { useCreateProject } from '@/lib/hooks/use-projects';
import { useQuery } from '@tanstack/react-query';
import { customersApi } from '@/lib/api';

export default function NewProjectPage() {
  const router = useRouter();
  const createProject = useCreateProject();

  // Fetch customers
  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await customersApi.getAll();
      return response.data;
    },
  });

  const customers = customersData?.data || [];

  const handleSubmit = async (data: any) => {
    try {
      await createProject.mutateAsync(data);
      router.push('/projects');
    } catch (error) {
      // Error handled by mutation
    }
  };

  if (customersLoading) {
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
          <Link href="/projects">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Project</h1>
          <p className="text-muted-foreground">
            Create a new project to track tasks and time
          </p>
        </div>
      </div>

      {/* Form */}
      <ProjectForm
        customers={customers}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/projects')}
        isSubmitting={createProject.isPending}
      />
    </div>
  );
}
