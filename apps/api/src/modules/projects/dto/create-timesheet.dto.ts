export interface CreateTimesheetDto {
  projectId: string;
  taskId?: string;
  date: string;
  hours: number | string;
  description?: string;
  isBillable?: boolean;
}

export interface UpdateTimesheetDto {
  projectId?: string;
  taskId?: string;
  date?: string;
  hours?: number | string;
  description?: string;
  isBillable?: boolean;
}
