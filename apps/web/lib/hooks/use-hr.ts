'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';

// Employee Types
export interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  joiningDate: string;
  departmentId: string | null;
  department?: {
    id: string;
    name: string;
  };
  jobTitle: string | null;
  basicSalary: string | number;
  allowances: Record<string, number> | null;
  deductions: Record<string, number> | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  taxId: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
  createdAt: string;
  updatedAt: string;
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

// API functions
const employeesApi = {
  getAll: (params?: any) => api.get('/employees', { params }),
  getOne: (id: string) => api.get(`/employees/${id}`),
  create: (data: any) => api.post('/employees', data),
  update: (id: string, data: any) => api.patch(`/employees/${id}`, data),
  delete: (id: string) => api.delete(`/employees/${id}`),
};

const attendanceApi = {
  getAll: (params?: any) => api.get('/attendance', { params }),
  mark: (data: any) => api.post('/attendance', data),
  markBulk: (data: any) => api.post('/attendance/bulk', data),
  update: (id: string, data: any) => api.patch(`/attendance/${id}`, data),
};

const payrollApi = {
  getAll: (params?: any) => api.get('/payroll', { params }),
  getOne: (id: string) => api.get(`/payroll/${id}`),
  run: (data: { month: number; year: number }) => api.post('/payroll/run', data),
  confirm: (id: string) => api.post(`/payroll/${id}/confirm`),
  markPaid: (id: string) => api.post(`/payroll/${id}/mark-paid`),
  getPayslip: (payrollId: string, payslipId: string) =>
    api.get(`/payroll/${payrollId}/payslips/${payslipId}`),
};

const departmentsApi = {
  getAll: () => api.get('/departments'),
};

// Employee Hooks
export function useEmployees(params?: any) {
  return useQuery({
    queryKey: ['employees', params],
    queryFn: async () => {
      const response = await employeesApi.getAll(params);
      return response.data;
    },
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
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create employee');
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => employeesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employee updated successfully');
    },
    onError: (error: any) => {
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
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete employee');
    },
  });
}

// Attendance Hooks
export function useAttendance(startDateOrParams?: string | any, endDate?: string) {
  // Support both (params) and (startDate, endDate) call signatures
  const params = typeof startDateOrParams === 'string'
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
    onError: (error: any) => {
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
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to mark attendance');
    },
  });
}

// Alias for backward compatibility
export const useBulkMarkAttendance = useMarkBulkAttendance;

// Payroll Hooks
export function usePayrollRuns(params?: any) {
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
    onError: (error: any) => {
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
    onError: (error: any) => {
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
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to mark payroll as paid');
    },
  });
}

export function useEmployeePayslips(employeeId: string) {
  return useQuery({
    queryKey: ['payslips', 'employee', employeeId],
    queryFn: async () => {
      const response = await api.get(`/employees/${employeeId}/payslips`);
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
        const response = await api.get(`/payslips/${payslipIdOrPayrollId}`);
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
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return months[month - 1] || '';
}
