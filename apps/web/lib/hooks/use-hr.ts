'use client';

import api, { attendanceApi, employeesApi, payrollApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { getLocalizedApiErrorMessage } from '@/lib/api-error';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

/** Toast copy for the HR mutations: `hr.toast.*`, with known API error codes translated. */
function useHrToasts(): {
  success: (key: string) => void;
  failure: (error: unknown, fallbackKey: string) => void;
} {
  const t = useTranslations('hr.toast');
  const tApiErrors = useTranslations('common.apiErrors');
  return {
    success: (key) => toast.success(t(key)),
    failure: (error, fallbackKey) =>
      toast.error(getLocalizedApiErrorMessage(error, t(fallbackKey), tApiErrors)),
  };
}

// Employee Types
export interface Employee {
  id: string;
  employeeId: string;
  employeeNumber: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  position: string | null;
  dateOfJoining: string;
  hireDate: string | null;
  basicSalary: string | number;
  baseSalary: string | number | null;
  allowances: Record<string, number> | null;
  deductions: Record<string, number> | null;
  bankAccount: string | null;
  nationalId: string | null;
  status: string | null;
  isActive: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// Attendance Types
export interface Attendance {
  id: string;
  employeeId: string;
  employee?: Employee;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HALF_DAY';
  checkIn: string | null;
  checkOut: string | null;
  notes: string | null;
}

// Payroll Types
export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: 'DRAFT' | 'CONFIRMED' | 'PAID';
  totalGross: string | number;
  totalDeductions: string | number;
  totalNet: string | number;
  employeeCount: number;
  payslips?: Payslip[];
  confirmedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface Payslip {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employee?: Employee;
  basicSalary: string | number;
  allowances: Record<string, number> | null;
  grossSalary: string | number;
  lopDays: number;
  lopAmount: string | number;
  deductions: Record<string, number> | null;
  totalDeductions: string | number;
  taxAmount: string | number;
  netSalary: string | number;
  status: 'DRAFT' | 'CONFIRMED' | 'PAID';
}

export type EmployeeStatus = Employee['status'];
export type AttendanceStatus = Attendance['status'];
export type PayrollStatus = PayrollRun['status'];

export interface EmployeeParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: EmployeeStatus;
  isActive?: boolean;
  departmentId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Employee Hooks
export function useEmployees(params?: EmployeeParams) {
  return useQuery({
    queryKey: ['employees', params],
    queryFn: async () => {
      const response = await employeesApi.getAll(params);
      return response.data;
    },
  });
}

export function useInfiniteEmployees(params?: Record<string, unknown>) {
  return useInfiniteTableData<Employee, Record<string, unknown>>({
    queryKey: ['employees'],
    fetchFn: async (p) => {
      const response = await employeesApi.getAllCursor(p);
      return response.data;
    },
    params: params || {},
  });
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: ['employees', id],
    queryFn: async () => {
      const response = await employeesApi.getOne(id);
      return response.data?.data || response.data;
    },
    enabled: !!id,
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  const toasts = useHrToasts();

  return useMutation({
    mutationFn: employeesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toasts.success('employeeCreated');
    },
    onError: (error: unknown) => {
      toasts.failure(error, 'employeeCreateError');
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  const toasts = useHrToasts();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      employeesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toasts.success('employeeUpdated');
    },
    onError: (error: unknown) => {
      toasts.failure(error, 'employeeUpdateError');
    },
  });
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient();
  const toasts = useHrToasts();

  return useMutation({
    mutationFn: employeesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toasts.success('employeeDeleted');
    },
    onError: (error: unknown) => {
      toasts.failure(error, 'employeeDeleteError');
    },
  });
}

export interface AttendanceParams {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  status?: AttendanceStatus;
  [key: string]: unknown;
}

// Attendance Hooks
export function useAttendance(startDateOrParams?: string | AttendanceParams, endDate?: string) {
  // Support both (params) and (startDate, endDate) call signatures
  const params =
    typeof startDateOrParams === 'string'
      ? { startDate: startDateOrParams, endDate }
      : startDateOrParams;

  return useQuery({
    queryKey: ['attendance', params],
    queryFn: async () => {
      const response = await attendanceApi.getAll(params);
      return response.data;
    },
  });
}

export function useBulkMarkAttendance() {
  const queryClient = useQueryClient();
  const toasts = useHrToasts();

  return useMutation({
    mutationFn: attendanceApi.markBulk,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      toasts.success('attendanceMarked');
    },
    onError: (error: unknown) => {
      toasts.failure(error, 'attendanceMarkError');
    },
  });
}

export interface PayrollRunParams {
  page?: number;
  limit?: number;
  status?: PayrollStatus;
  year?: number;
  month?: number;
  [key: string]: unknown;
}

// Payroll Hooks
export function usePayrollRuns(params?: PayrollRunParams) {
  return useQuery({
    queryKey: ['payroll', params],
    queryFn: async () => {
      const response = await payrollApi.getAll(params);
      return response.data;
    },
  });
}

export function usePayrollRun(id: string) {
  return useQuery({
    queryKey: ['payroll', id],
    queryFn: async () => {
      const response = await payrollApi.getOne(id);
      return response.data?.data || response.data;
    },
    enabled: !!id,
  });
}

export function useRunPayroll() {
  const queryClient = useQueryClient();
  const toasts = useHrToasts();

  return useMutation({
    mutationFn: async (data: { month: number; year: number }) => {
      const response = await payrollApi.run(data);
      return response.data?.data || response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toasts.success('payrollRunCreated');
    },
    onError: (error: unknown) => {
      toasts.failure(error, 'payrollRunError');
    },
  });
}

export function useConfirmPayroll() {
  const queryClient = useQueryClient();
  const toasts = useHrToasts();

  return useMutation({
    mutationFn: payrollApi.confirm,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toasts.success('payrollConfirmed');
    },
    onError: (error: unknown) => {
      toasts.failure(error, 'payrollConfirmError');
    },
  });
}

export function useEmployeePayslips(employeeId: string) {
  return useQuery({
    queryKey: ['payslips', 'employee', employeeId],
    queryFn: async () => {
      const response = await api.get(`/payroll/payslips/employee/${employeeId}`);
      return response.data?.data || response.data;
    },
    enabled: !!employeeId,
  });
}

export function usePayslip(payslipIdOrPayrollId: string, payslipId?: string) {
  // Support both (payslipId) and (payrollId, payslipId) call signatures
  const isDirectAccess = !payslipId;

  return useQuery({
    queryKey: isDirectAccess
      ? ['payslips', payslipIdOrPayrollId]
      : ['payslips', payslipIdOrPayrollId, payslipId],
    queryFn: async () => {
      if (isDirectAccess) {
        // Direct access by payslip ID
        const response = await api.get(`/payroll/payslips/${payslipIdOrPayrollId}`);
        return response.data?.data || response.data;
      } else {
        // Access via payroll run
        const response = await payrollApi.getPayslip(payslipIdOrPayrollId, payslipId!);
        return response.data?.data || response.data;
      }
    },
    enabled: !!payslipIdOrPayrollId,
  });
}

export function useDepartmentSummary() {
  return useQuery({
    queryKey: ['employees', 'department-summary'],
    queryFn: async () => {
      const response = await api.get('/employees/summary');
      return response.data?.data || response.data;
    },
  });
}

// Helper functions

/** A next-intl translator for the `hr` namespace (`useTranslations('hr')`). */
type HrTranslator = (key: string) => string;

const EMPLOYEE_STATUS_KEYS: Record<string, string> = {
  ACTIVE: 'employees.status.active',
  INACTIVE: 'employees.status.inactive',
  TERMINATED: 'employees.status.terminated',
};

const ATTENDANCE_STATUS_KEYS: Record<AttendanceStatus, string> = {
  PRESENT: 'attendance.status.present',
  ABSENT: 'attendance.status.absent',
  LEAVE: 'attendance.status.leave',
  HALF_DAY: 'attendance.status.halfDay',
};

const PAYROLL_STATUS_KEYS: Record<PayrollStatus, string> = {
  DRAFT: 'payroll.status.draft',
  CONFIRMED: 'payroll.status.confirmed',
  PAID: 'payroll.status.paid',
};

/** The translated label of an employee status; the API value stays the option value. */
export function getEmployeeStatusLabel(status: EmployeeStatus, t: HrTranslator): string {
  const key = status ? EMPLOYEE_STATUS_KEYS[status] : undefined;
  return key ? t(key) : status || t('unknownStatus');
}

export function getEmployeeStatusColor(status: EmployeeStatus): string {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    INACTIVE: 'bg-yellow-100 text-yellow-800',
    TERMINATED: 'bg-red-100 text-red-800',
  };
  return (status && colors[status]) || colors.ACTIVE;
}

export function getAttendanceStatusLabel(status: AttendanceStatus, t: HrTranslator): string {
  const key = ATTENDANCE_STATUS_KEYS[status];
  return key ? t(key) : status;
}

export function getAttendanceStatusColor(status: AttendanceStatus): string {
  const colors: Record<AttendanceStatus, string> = {
    PRESENT: 'bg-green-100 text-green-800',
    ABSENT: 'bg-red-100 text-red-800',
    LEAVE: 'bg-blue-100 text-blue-800',
    HALF_DAY: 'bg-yellow-100 text-yellow-800',
  };
  return colors[status] || colors.PRESENT;
}

export function getPayrollStatusLabel(status: PayrollStatus, t: HrTranslator): string {
  const key = PAYROLL_STATUS_KEYS[status];
  return key ? t(key) : status;
}

export function getPayrollStatusColor(status: PayrollStatus): string {
  const colors: Record<PayrollStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    CONFIRMED: 'bg-blue-100 text-blue-800',
    PAID: 'bg-green-100 text-green-800',
  };
  return colors[status] || colors.DRAFT;
}

export function formatCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return '$0.00';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

/** The month name (1-12) in the page language, e.g. "October" or "أكتوبر". */
export function getMonthName(month: number, locale: string): string {
  if (month < 1 || month > 12) return '';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en-US', {
    month: 'long',
  }).format(new Date(2000, month - 1, 1));
}
