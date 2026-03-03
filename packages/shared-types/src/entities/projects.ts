// ============================================
// Projects Types - Projects, Tasks, Timesheet Entries
// ============================================

import { BillingMethod, ProjectStatus, TaskStatus, TaskPriority, TimesheetStatus } from '../enums';
import { OrganizationEntity, PaginationQuery } from './base';

// --- Project ---

export interface Project extends OrganizationEntity {
  name: string;
  projectNumber?: string | null;
  customerId?: string | null;
  customer?: { id: string; name: string };
  billingMethod: BillingMethod;
  budgetAmount?: string | null;
  budget?: string | null;
  budgetHours?: string | null;
  hourlyRate?: string | null;
  fixedPrice?: string | null;
  status: ProjectStatus;
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
  color?: string | null;
  tags: string[];
  tasks?: Task[];
  totalHours?: number;
  totalBilled?: string;
  totalExpenses?: string;
  profitMargin?: number | null;
}

export interface CreateProjectRequest {
  name: string;
  customerId?: string;
  billingMethod: BillingMethod;
  budgetAmount?: string;
  budgetHours?: number;
  hourlyRate?: string;
  fixedPrice?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  color?: string;
  tags?: string[];
}

export interface UpdateProjectRequest extends Partial<CreateProjectRequest> {
  status?: ProjectStatus;
}

export interface ProjectQuery extends PaginationQuery {
  status?: ProjectStatus;
  customerId?: string;
}

// --- Task ---

export interface Task extends OrganizationEntity {
  name: string;
  projectId: string;
  project?: Project;
  description?: string | null;
  ratePerHour: string;
  isBillable: boolean;
  status: TaskStatus;
  priority: TaskPriority;
  sortOrder: number;
  assigneeId?: string | null;
  assignee?: { id: string; name: string; firstName?: string; lastName?: string };
  dueDate?: string | null;
  estimatedHours?: string | null;
  tags: string[];
  totalHours?: number;
  actualHours?: number;
}

export interface CreateTaskRequest {
  name: string;
  projectId: string;
  description?: string;
  ratePerHour: string;
  isBillable?: boolean;
  priority?: TaskPriority;
  assigneeId?: string;
  dueDate?: string;
  estimatedHours?: number;
  tags?: string[];
}

export interface UpdateTaskRequest {
  name?: string;
  description?: string;
  ratePerHour?: string;
  isBillable?: boolean;
  status?: TaskStatus;
  priority?: TaskPriority;
  sortOrder?: number;
  assigneeId?: string;
  dueDate?: string;
  estimatedHours?: number;
  tags?: string[];
}

// --- Timesheet Entry ---

export interface TimesheetEntry extends OrganizationEntity {
  userId: string;
  user?: { id: string; name: string; firstName?: string; lastName?: string };
  projectId: string;
  project?: Project;
  taskId?: string | null;
  task?: Task;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  duration: string;
  hours?: string | null;
  description?: string | null;
  isBillable: boolean;
  isBilled: boolean;
  status: TimesheetStatus;
  invoiceId?: string | null;
  timerStartedAt?: string | null;
  timerEndedAt?: string | null;
}

export interface CreateTimesheetEntryRequest {
  projectId: string;
  taskId?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  hours?: number;
  description?: string;
  isBillable?: boolean;
}

export interface TimesheetQuery extends PaginationQuery {
  projectId?: string;
  employeeId?: string;
  status?: TimesheetStatus;
  dateFrom?: string;
  dateTo?: string;
}
