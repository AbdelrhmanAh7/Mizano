'use client';

import api, { attendanceApi, departmentsApi, employeesApi, payrollApi } from '@/lib/api';
import { useInfiniteTableData } from '@/lib/hooks/use-infinite-table-data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Types
type ApiError = { response?: { data?: { message?: string } } };

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

  return useMutation({
    mutationFn: employeesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employee created successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to create employee');
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      employeesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employee updated successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to update employee');
    },
  });
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: employeesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employee deleted successfully');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to delete employee');
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

export function useMarkAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: attendanceApi.mark,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      toast.success('Attendance marked');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to mark attendance');
    },
  });
}

export function useMarkBulkAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: attendanceApi.markBulk,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      toast.success('Attendance marked for all employees');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to mark attendance');
    },
  });
}

// Alias for backward compatibility
export const useBulkMarkAttendance = useMarkBulkAttendance;

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

  return useMutation({
    mutationFn: async (data: { month: number; year: number }) => {
      const response = await payrollApi.run(data);
      return response.data?.data || response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast.success('Payroll run created');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to run payroll');
    },
  });
}

export function useConfirmPayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: payrollApi.confirm,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast.success('Payroll confirmed');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to confirm payroll');
    },
  });
}

export function useMarkPayrollPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: payrollApi.markPaid,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast.success('Payroll marked as paid');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to mark payroll as paid');
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

// Employee Summary Hooks
export function useEmployeeCount() {
  return useQuery({
    queryKey: ['employees', 'count'],
    queryFn: async () => {
      const response = await api.get('/employees/count');
      return response.data?.data || response.data;
    },
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

// Department Hook
export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const response = await departmentsApi.getAll();
      return response.data;
    },
  });
}

// Helper functions
export const employeeStatusOptions = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'TERMINATED', label: 'Terminated' },
];

export const attendanceStatusOptions = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LEAVE', label: 'On Leave' },
  { value: 'HALF_DAY', label: 'Half Day' },
];

export const payrollStatusOptions = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PAID', label: 'Paid' },
];

export function getEmployeeStatusLabel(status: EmployeeStatus): string {
  return employeeStatusOptions.find((s) => s.value === status)?.label || status;
}

export function getEmployeeStatusColor(status: EmployeeStatus): string {
  const colors: Record<EmployeeStatus, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    INACTIVE: 'bg-yellow-100 text-yellow-800',
    TERMINATED: 'bg-red-100 text-red-800',
  };
  return colors[status] || colors.ACTIVE;
}

export function getAttendanceStatusLabel(status: AttendanceStatus): string {
  return attendanceStatusOptions.find((s) => s.value === status)?.label || status;
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

export function getPayrollStatusLabel(status: PayrollStatus): string {
  return payrollStatusOptions.find((s) => s.value === status)?.label || status;
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

export function getMonthName(month: number): string {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return months[month - 1] || '';
}
