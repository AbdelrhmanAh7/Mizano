import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum BulkEntityType {
  INVOICES = 'invoices',
  BILLS = 'bills',
  EXPENSES = 'expenses',
  QUOTES = 'quotes',
  JOURNALS = 'journals',
  WORK_ORDERS = 'work-orders',
  VAT_RETURNS = 'vat-returns',
  PAYROLL = 'payroll',
  PROJECTS = 'projects',
}

export enum BulkActionType {
  DELETE = 'delete',
  APPROVE = 'approve',
  SEND = 'send',
  VOID = 'void',
  PAY = 'pay',
  OPEN = 'open',
  START = 'start',
  COMPLETE = 'complete',
  CANCEL = 'cancel',
  SUBMIT = 'submit',
  PROCESS = 'process',
  ACTIVATE = 'activate',
  HOLD = 'hold',
  DECLINE = 'decline',
  EXPORT = 'export',
}

export type BulkJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface BulkJobState {
  jobId: string;
  organizationId: string;
  entityType: BulkEntityType;
  action: BulkActionType;
  status: BulkJobStatus;
  ids: string[];
  processed: number;
  total: number;
  failures: Array<{ id: string; reason: string }>;
  startedAt: Date;
  completedAt?: Date;
}

export class BulkJobProgressDto {
  @ApiProperty()
  jobId: string;

  @ApiProperty()
  status: BulkJobStatus;

  @ApiProperty()
  processed: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  progress: number;

  @ApiPropertyOptional({ type: [Object] })
  failures?: Array<{ id: string; reason: string }>;
}
