'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';

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
  billingMethod: 'FIXED' | 'PROJECT_HOURLY' | 'TASK_HOURLY' | 'STAFF_HOURLY';
  budgetType: 'COST' | 'HOURS';
  budgetAmount: string | number;
  hourlyRate: string | number | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
  startDate: string;
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

export interface TimesheetFilters {
  projectId?: string;
  employeeId?: string;
  status?: 'UNBILLED' | 'INVOICED';
  dateFrom?: string;
  dateTo?: string;
}

// Error type for API responses
type ApiError = { response?: { data?: { message?: string } } };

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
  create: (data: Record<string, unknown>) => api.post('/timesheets', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/timesheets/${id}`, data),
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

  return useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project created successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to create project');
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      projectsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project updated successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to update project');
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to delete project');
    },
  });
}

export function useCreateProjectInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      projectsApi.createInvoice(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice created from project');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to create invoice');
    },
  });
}

export function useProjectSummary() {
  return useQuery({
    queryKey: ['projects', 'summary'],
    queryFn: async () => {
      const response = await projectsApi.getSummary();
      return response.data?.data || response.data;
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

  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: Record<string, unknown> }) =>
      tasksApi.create({ ...data, projectId }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Task created successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to create task');
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

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
      toast.success('Task updated successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to update task');
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId }: { projectId: string; taskId: string }) => tasksApi.delete(taskId),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Task deleted successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to delete task');
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

  return useMutation({
    mutationFn: timesheetsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Time entry created successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to create time entry');
    },
  });
}

export function useDeleteTimesheet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: timesheetsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Time entry deleted successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to delete time entry');
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

  return useMutation({
    mutationFn: timesheetsApi.startTimer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets', 'timer'] });
      toast.success('Timer started');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to start timer');
    },
  });
}

export function useStopTimer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: timesheetsApi.stopTimer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Timer stopped and time entry created');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to stop timer');
    },
  });
}

// Helper functions
export const billingMethodOptions = [
  { value: 'FIXED', label: 'Fixed Price', description: 'Bill a fixed amount for the project' },
  { value: 'PROJECT_HOURLY', label: 'Project Hourly', description: 'Bill hours at project rate' },
  { value: 'TASK_HOURLY', label: 'Task Hourly', description: 'Bill hours at task-specific rates' },
  { value: 'STAFF_HOURLY', label: 'Staff Hourly', description: 'Bill hours at staff rates' },
];

export const projectStatusOptions = [
  { value: 'ACTIVE', label: 'Active' },
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
    ACTIVE: 'bg-green-100 text-green-800',
    COMPLETED: 'bg-blue-100 text-blue-800',
    ON_HOLD: 'bg-yellow-100 text-yellow-800',
    CANCELLED: 'bg-gray-100 text-gray-800',
  };
  return colors[status] || colors.ACTIVE;
}

export function getTaskStatusLabel(status: TaskStatus): string {
  return taskStatusOptions.find((s) => s.value === status)?.label || status;
}

export function getTaskStatusColor(status: TaskStatus): string {
  const colors: Record<TaskStatus, string> = {
    TODO: 'bg-gray-100 text-gray-800',
    IN_PROGRESS: 'bg-blue-100 text-blue-800',
    REVIEW: 'bg-yellow-100 text-yellow-800',
    DONE: 'bg-green-100 text-green-800',
  };
  return colors[status] || colors.TODO;
}

export function formatCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return '$0.00';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

export function formatHours(hours: string | number | null | undefined): string {
  if (hours === null || hours === undefined) return '0h';
  const num = typeof hours === 'string' ? parseFloat(hours) : hours;
  return `${num.toFixed(1)}h`;
}
