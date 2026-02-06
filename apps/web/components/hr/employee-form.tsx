'use client';

import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  useCreateEmployee,
  useUpdateEmployee,
  Employee,
} from '@/lib/hooks/use-hr';

const allowanceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  amount: z.number().min(0, 'Amount must be positive'),
});

const deductionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  amount: z.number().min(0, 'Amount must be positive'),
});

const employeeSchema = z.object({
  employeeNumber: z.string().min(1, 'Employee number is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  joiningDate: z.date({ required_error: 'Joining date is required' }),
  department: z.string().optional(),
  jobTitle: z.string().optional(),
  basicSalary: z.number().min(0, 'Salary must be positive'),
  allowances: z.array(allowanceSchema).default([]),
  deductions: z.array(deductionSchema).default([]),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  taxId: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']).default('ACTIVE'),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

interface EmployeeFormProps {
  employee?: Employee;
}

export function EmployeeForm({ employee }: EmployeeFormProps) {
  const router = useRouter();
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();

  // Convert Record<string, number> to array format
  const allowancesToArray = (allowances: Record<string, number> | null | undefined) => {
    if (!allowances || Array.isArray(allowances)) return allowances || [];
    return Object.entries(allowances).map(([name, amount]) => ({ name, amount }));
  };

  const deductionsToArray = (deductions: Record<string, number> | null | undefined) => {
    if (!deductions || Array.isArray(deductions)) return deductions || [];
    return Object.entries(deductions).map(([name, amount]) => ({ name, amount }));
  };

  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: employee
      ? {
          employeeNumber: employee.employeeNumber,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          phone: employee.phone || '',
          joiningDate: new Date(employee.joiningDate),
          department: employee.departmentId || '',
          jobTitle: employee.jobTitle || '',
          basicSalary: typeof employee.basicSalary === 'string'
            ? parseFloat(employee.basicSalary)
            : employee.basicSalary,
          allowances: allowancesToArray(employee.allowances as Record<string, number> | null),
          deductions: deductionsToArray(employee.deductions as Record<string, number> | null),
          bankName: employee.bankName || '',
          bankAccountNumber: employee.bankAccountNumber || '',
          taxId: employee.taxId || '',
          status: employee.status,
        }
      : {
          employeeNumber: '',
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          joiningDate: new Date(),
          department: '',
          jobTitle: '',
          basicSalary: 0,
          allowances: [],
          deductions: [],
          bankName: '',
          bankAccountNumber: '',
          taxId: '',
          status: 'ACTIVE',
        },
  });

  const {
    fields: allowanceFields,
    append: appendAllowance,
    remove: removeAllowance,
  } = useFieldArray({
    control: form.control,
    name: 'allowances',
  });

  const {
    fields: deductionFields,
    append: appendDeduction,
    remove: removeDeduction,
  } = useFieldArray({
    control: form.control,
    name: 'deductions',
  });

  const handleSubmit = async (data: EmployeeFormData) => {
    try {
      const payload = {
        ...data,
        joiningDate: format(data.joiningDate, 'yyyy-MM-dd'),
      };

      if (employee) {
        await updateEmployee.mutateAsync({ id: employee.id, data: payload });
      } else {
        await createEmployee.mutateAsync(payload);
      }
      router.push('/hr/employees');
    } catch (error) {
      // Error handled by mutation
    }
  };

  const isPending = createEmployee.isPending || updateEmployee.isPending;

  // Calculate totals
  const totalAllowances = form.watch('allowances').reduce((sum, a) => sum + (a.amount || 0), 0);
  const totalDeductions = form.watch('deductions').reduce((sum, d) => sum + (d.amount || 0), 0);
  const basicSalary = form.watch('basicSalary') || 0;
  const grossSalary = basicSalary + totalAllowances;
  const netSalary = grossSalary - totalDeductions;

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Basic employee details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employeeNumber">Employee Number *</Label>
              <Input
                id="employeeNumber"
                placeholder="EMP-001"
                {...form.register('employeeNumber')}
              />
              {form.formState.errors.employeeNumber && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.employeeNumber.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                placeholder="John"
                {...form.register('firstName')}
              />
              {form.formState.errors.firstName && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.firstName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                placeholder="Doe"
                {...form.register('lastName')}
              />
              {form.formState.errors.lastName && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="john.doe@company.com"
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="+1 234 567 8900"
                {...form.register('phone')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Joining Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !form.watch('joiningDate') && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.watch('joiningDate')
                      ? format(form.watch('joiningDate'), 'PPP')
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.watch('joiningDate')}
                    onSelect={(date) => date && form.setValue('joiningDate', date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                placeholder="Engineering"
                {...form.register('department')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="jobTitle">Job Title</Label>
              <Input
                id="jobTitle"
                placeholder="Software Engineer"
                {...form.register('jobTitle')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={form.watch('status')}
              onValueChange={(value: 'ACTIVE' | 'INACTIVE' | 'TERMINATED') =>
                form.setValue('status', value)
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="TERMINATED">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Salary Structure */}
      <Card>
        <CardHeader>
          <CardTitle>Salary Structure</CardTitle>
          <CardDescription>Basic salary, allowances, and deductions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="basicSalary">Basic Salary *</Label>
            <Input
              id="basicSalary"
              type="number"
              step="0.01"
              min="0"
              placeholder="5000.00"
              {...form.register('basicSalary', { valueAsNumber: true })}
            />
            {form.formState.errors.basicSalary && (
              <p className="text-sm text-red-500">
                {form.formState.errors.basicSalary.message}
              </p>
            )}
          </div>

          {/* Allowances */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Allowances</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendAllowance({ name: '', amount: 0 })}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Allowance
              </Button>
            </div>
            {allowanceFields.length > 0 ? (
              <div className="space-y-2">
                {allowanceFields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-3">
                    <Input
                      placeholder="Housing"
                      {...form.register(`allowances.${index}.name`)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      {...form.register(`allowances.${index}.amount`, { valueAsNumber: true })}
                      className="w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAllowance(index)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No allowances added</p>
            )}
          </div>

          {/* Deductions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Deductions</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendDeduction({ name: '', amount: 0 })}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Deduction
              </Button>
            </div>
            {deductionFields.length > 0 ? (
              <div className="space-y-2">
                {deductionFields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-3">
                    <Input
                      placeholder="Insurance"
                      {...form.register(`deductions.${index}.name`)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      {...form.register(`deductions.${index}.amount`, { valueAsNumber: true })}
                      className="w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeDeduction(index)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No deductions added</p>
            )}
          </div>

          {/* Salary Summary */}
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <div className="flex justify-between">
              <span>Basic Salary</span>
              <span className="font-mono">{basicSalary.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span>+ Allowances</span>
              <span className="font-mono">{totalAllowances.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="font-medium">Gross Salary</span>
              <span className="font-mono font-medium">{grossSalary.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>- Deductions</span>
              <span className="font-mono">{totalDeductions.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-lg">
              <span className="font-bold">Net Salary</span>
              <span className="font-mono font-bold">{netSalary.toLocaleString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Banking Details */}
      <Card>
        <CardHeader>
          <CardTitle>Banking & Tax Details</CardTitle>
          <CardDescription>Payment and tax information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bankName">Bank Name</Label>
              <Input
                id="bankName"
                placeholder="National Bank"
                {...form.register('bankName')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bankAccountNumber">Account Number</Label>
              <Input
                id="bankAccountNumber"
                placeholder="1234567890"
                {...form.register('bankAccountNumber')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxId">Tax ID</Label>
              <Input
                id="taxId"
                placeholder="TAX-123456"
                {...form.register('taxId')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : employee ? 'Update Employee' : 'Add Employee'}
        </Button>
      </div>
    </form>
  );
}
