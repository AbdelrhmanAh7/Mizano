'use client';

import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';

export interface Project {
  id: string;
  projectNumber: string;
  name: string;
  description: string | null;
  customerId: string;
  customer?: {
    id: string;
    name: string;
  };
  billingMethod: 'FIXED' | 'HOURLY' | 'PROJECT_HOURLY' | 'TASK_HOURLY' | 'STAFF_HOURLY';
  budgetType: 'COST' | 'HOURS';
  budgetAmount: string | number | null;
  hourlyRate: string | number | null;
  status: 'PLANNING' | 'ACTIVE' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
  startDate: string | null;
  endDate: string | null;
  totalHours: number;
  totalBilled: string | number;
  totalExpenses: string | number;
  profitMargin: number | null;
  tasks?: Task[];
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  hourlyRate: string | number | null;
  isBillable: boolean;
  estimatedHours: number | null;
  actualHours: number;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
  assigneeId: string | null;
  assignee?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  dueDate: string | null;
  createdAt: string;
}

export interface TimesheetEntry {
  id: string;
  taskId: string;
  task?: Task & { project?: Project };
  employeeId: string;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  date: string;
  hours: string | number;
  description: string | null;
  startTime: string | null;
  endTime: string | null;
  status: 'UNBILLED' | 'INVOICED';
  invoiceLineId: string | null;
  createdAt: string;
}

export type BillingMethod = Project['billingMethod'];
export type ProjectStatus = Project['status'];
export type TaskStatus = Task['status'];

export interface ProjectFilters {
  search?: string;
  status?: ProjectStatus;
  customerId?: string;
}

/** The filters GET /timesheets accepts; any other query parameter is refused with a 400. */
export interface TimesheetFilters {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  projectId?: string;
  userId?: string;
  status?: 'UNBILLED' | 'INVOICED';
  startDate?: string;
  endDate?: string;
}

/** POST /timesheets: hours travel as a decimal string ("1.50"). */
export interface CreateTimesheetPayload {
  projectId: string;
  taskId?: string;
  date: string;
  hours: string;
  description?: string;
  isBillable?: boolean;
}

// API functions
const projectsApi = {
  getAll: (params?: ProjectFilters) => api.get('/projects', { params }),
  getOne: (id: string) => api.get(`/projects/${id}`),
  create: (data: Record<string, unknown>) => api.post('/projects', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  getProfitability: (id: string) => api.get(`/projects/${id}/profitability`),
  createInvoice: (id: string, data: Record<string, unknown>) =>
    api.post(`/projects/${id}/invoice`, data),
  getSummary: () => api.get('/projects/summary'),
};

const tasksApi = {
  getAll: (projectId: string) => api.get(`/tasks/project/${projectId}`),
  getMyTasks: () => api.get('/tasks/my-tasks'),
  create: (data: Record<string, unknown>) => api.post('/tasks', data),
  update: (taskId: string, data: Record<string, unknown>) => api.put(`/tasks/${taskId}`, data),
  delete: (taskId: string) => api.delete(`/tasks/${taskId}`),
};

const timesheetsApi = {
  getAll: (params?: TimesheetFilters) => api.get('/timesheets', { params }),
  create: (data: CreateTimesheetPayload) => api.post('/timesheets', data),
  update: (id: string, data: Partial<Omit<CreateTimesheetPayload, 'projectId' | 'taskId'>>) =>
    api.put(`/timesheets/${id}`, data),
  delete: (id: string) => api.delete(`/timesheets/${id}`),
  startTimer: (data: { projectId: string; taskId?: string; description?: string }) =>
    api.post('/timesheets/timer/start', data),
  stopTimer: (id: string) => api.post(`/timesheets/timer/stop/${id}`),
  getActiveTimer: () => api.get('/timesheets/timer/running'),
};

// Project Hooks
export function useProjects(params?: ProjectFilters) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: async () => {
      const response = await projectsApi.getAll(params);
      return response.data;
    },
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: async () => {
      const response = await projectsApi.getOne(id);
      return response.data?.data || response.data;
    },
    enabled: !!id,
  });
}

export function useProjectProfitability(id: string) {
  return useQuery({
    queryKey: ['projects', id, 'profitability'],
    queryFn: async () => {
      const response = await projectsApi.getProfitability(id);
      return response.data?.data || response.data;
    },
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const t = useTranslations('projects.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(t('projectCreated'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('projectCreateError'), tApiErrors));
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  const t = useTranslations('projects.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      projectsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(t('projectUpdated'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('projectUpdateError'), tApiErrors));
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  const t = useTranslations('projects.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(t('projectDeleted'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('projectDeleteError'), tApiErrors));
    },
  });
}

// Task Hooks
export function useTasks(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'tasks'],
    queryFn: async () => {
      const response = await tasksApi.getAll(projectId);
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const t = useTranslations('projects.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: Record<string, unknown> }) =>
      tasksApi.create({ ...data, projectId }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success(t('taskCreated'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('taskCreateError'), tApiErrors));
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  const t = useTranslations('projects.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: ({
      taskId,
      data,
    }: {
      projectId: string;
      taskId: string;
      data: Record<string, unknown>;
    }) => tasksApi.update(taskId, data),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'my-tasks'] });
      toast.success(t('taskUpdated'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('taskUpdateError'), tApiErrors));
    },
  });
}

export function useMyTasks() {
  return useQuery({
    queryKey: ['tasks', 'my-tasks'],
    queryFn: async () => {
      const response = await tasksApi.getMyTasks();
      return response.data?.data || response.data;
    },
  });
}

// Timesheet Hooks
export function useTimesheets(params?: TimesheetFilters) {
  return useQuery({
    queryKey: ['timesheets', params],
    queryFn: async () => {
      const response = await timesheetsApi.getAll(params);
      return response.data;
    },
  });
}

export function useCreateTimesheet() {
  const queryClient = useQueryClient();
  const t = useTranslations('projects.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: timesheetsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(t('timeEntryCreated'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('timeEntryCreateError'), tApiErrors));
    },
  });
}

export function useDeleteTimesheet() {
  const queryClient = useQueryClient();
  const t = useTranslations('projects.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: timesheetsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(t('timeEntryDeleted'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('timeEntryDeleteError'), tApiErrors));
    },
  });
}

export function useActiveTimer() {
  return useQuery({
    queryKey: ['timesheets', 'timer', 'active'],
    queryFn: async () => {
      const response = await timesheetsApi.getActiveTimer();
      return response.data?.data || response.data;
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

export function useStartTimer() {
  const queryClient = useQueryClient();
  const t = useTranslations('projects.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: timesheetsApi.startTimer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets', 'timer'] });
      toast.success(t('timerStarted'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('timerStartError'), tApiErrors));
    },
  });
}

export function useStopTimer() {
  const queryClient = useQueryClient();
  const t = useTranslations('projects.toast');
  const tApiErrors = useTranslations('common.apiErrors');

  return useMutation({
    mutationFn: timesheetsApi.stopTimer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(t('timerStopped'));
    },
    onError: (error: unknown) => {
      toast.error(getLocalizedApiErrorMessage(error, t('timerStopError'), tApiErrors));
    },
  });
}

// Helper functions
export const billingMethodOptions = [
  { value: 'FIXED', label: 'Fixed Price', description: 'Bill a fixed amount for the project' },
  { value: 'HOURLY', label: 'Hourly', description: 'Bill hours at a set rate' },
  { value: 'PROJECT_HOURLY', label: 'Project Hourly', description: 'Bill hours at project rate' },
  { value: 'TASK_HOURLY', label: 'Task Hourly', description: 'Bill hours at task-specific rates' },
  { value: 'STAFF_HOURLY', label: 'Staff Hourly', description: 'Bill hours at staff rates' },
];

export const projectStatusOptions = [
  { value: 'PLANNING', label: 'Planning' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export const taskStatusOptions = [
  { value: 'TODO', label: 'To Do' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'REVIEW', label: 'In Review' },
  { value: 'DONE', label: 'Done' },
];

export function getBillingMethodLabel(method: BillingMethod): string {
  return billingMethodOptions.find((m) => m.value === method)?.label || method;
}

export function getProjectStatusLabel(status: ProjectStatus): string {
  return projectStatusOptions.find((s) => s.value === status)?.label || status;
}

export function getProjectStatusColor(status: ProjectStatus): string {
  const colors: Record<ProjectStatus, string> = {
    PLANNING: 'bg-primary/10 text-primary',
    ACTIVE: 'bg-success/10 text-success',
    IN_PROGRESS: 'bg-info/10 text-info',
    COMPLETED: 'bg-info/10 text-info',
    ON_HOLD: 'bg-warning/10 text-warning',
    CANCELLED: 'bg-muted text-foreground',
  };
  return colors[status] || colors.ACTIVE;
}

export function getTaskStatusLabel(status: TaskStatus): string {
  return taskStatusOptions.find((s) => s.value === status)?.label || status;
}

export function getTaskStatusColor(status: TaskStatus): string {
  const colors: Record<TaskStatus, string> = {
    TODO: 'bg-muted text-foreground',
    IN_PROGRESS: 'bg-info/10 text-info',
    REVIEW: 'bg-warning/10 text-warning',
    DONE: 'bg-success/10 text-success',
  };
  return colors[status] || colors.TODO;
}

export function formatHours(hours: string | number | null | undefined): string {
  if (hours === null || hours === undefined) return '0h';
  const num = typeof hours === 'string' ? parseFloat(hours) : hours;
  return `${num.toFixed(1)}h`;
}
