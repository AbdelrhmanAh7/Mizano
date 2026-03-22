'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectForm } from '@/components/projects/project-form';
import { useProject, useUpdateProject } from '@/lib/hooks/use-projects';
import { useQuery } from '@tanstack/react-query';
import { customersApi } from '@/lib/api';
import { useTranslations } from 'next-intl';

interface EditProjectPageProps {
  params: { id: string };
}

export default function EditProjectPage({ params }: EditProjectPageProps) {
  const { id } = params;
  const t = useTranslations('projects');
  const router = useRouter();
  const { data: project, isLoading: projectLoading } = useProject(id);
  const updateProject = useUpdateProject();

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await customersApi.getAll();
      return response.data;
    },
  });

  const customers = customersData?.data || [];

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await updateProject.mutateAsync({ id, data });
      router.push(`/projects/${id}`);
    } catch (error) {
      // Error handled by mutation
    }
  };

  if (projectLoading || customersLoading) {
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
          <h1 className="text-3xl font-bold tracking-tight">{t('projects.editProject')}</h1>
          <p className="text-muted-foreground">Update project details for {project.name}</p>
        </div>
      </div>

      <ProjectForm
        project={project}
        customers={customers}
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/projects/${id}`)}
        isSubmitting={updateProject.isPending}
      />
    </div>
  );
}
