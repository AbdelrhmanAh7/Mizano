// ============================================
// HR Types - Employees, Attendance, Payroll, Payslips
// ============================================

import { AttendanceStatus, PayrollStatus } from '../enums';
import { OrganizationEntity, PaginationQuery } from './base';

// --- Employee ---

export interface Employee extends OrganizationEntity {
  employeeId: string;
  employeeNumber?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  position?: string | null;
  dateOfJoining: string;
  hireDate?: string | null;
  basicSalary: string;
  baseSalary?: string | null;
  allowances: Record<string, number | string>;
  deductions: Record<string, number | string>;
  bankAccount?: string | null;
  nationalId?: string | null;
  status?: string | null;
  isActive: boolean;
}

export interface CreateEmployeeRequest {
  employeeId: string;
  employeeNumber?: string;
  name: string;
  email?: string;
  phone?: string;
  department?: string;
  jobTitle?: string;
  position?: string;
  dateOfJoining: string;
  hireDate?: string;
  basicSalary: string;
  baseSalary?: string;
  allowances?: Record<string, number | string>;
  deductions?: Record<string, number | string>;
  bankAccount?: string;
  nationalId?: string;
}

export interface UpdateEmployeeRequest extends Partial<CreateEmployeeRequest> {
  isActive?: boolean;
}

export interface EmployeeQuery extends PaginationQuery {
  isActive?: boolean;
  department?: string;
}

// --- Attendance ---

export interface Attendance extends OrganizationEntity {
  employeeId: string;
  employee?: Employee;
  date: string;
  status: AttendanceStatus;
  checkIn?: string | null;
  checkOut?: string | null;
  notes?: string | null;
}

export interface CreateAttendanceRequest {
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  notes?: string;
}

// --- Payroll Run ---

export interface PayrollRun extends OrganizationEntity {
  month: number;
  year: number;
  periodStart?: string | null;
  periodEnd?: string | null;
  payDate?: string | null;
  status: PayrollStatus;
  processedAt?: string | null;
  paidAt?: string | null;
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
  journalId?: string | null;
  payslips?: Payslip[];
}

export interface CreatePayrollRunRequest {
  month: number;
  year: number;
  periodStart?: string;
  periodEnd?: string;
  payDate?: string;
}

// --- Payslip ---

export interface Payslip {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employee?: Employee;
  basicSalary: string;
  baseSalary?: string | null;
  allowances: Record<string, number | string>;
  housingAllowance?: string;
  transportAllowance?: string;
  otherAllowances?: string;
  overtime?: string;
  bonus?: string;
  grossSalary: string;
  grossPay?: string | null;
  lop: string;
  deductions: Record<string, number | string>;
  gosiEmployee?: string;
  incomeTax?: string;
  loanDeduction?: string;
  otherDeductions?: string;
  totalDeductions?: string;
  taxes: string;
  netSalary: string;
  netPay?: string | null;
}
