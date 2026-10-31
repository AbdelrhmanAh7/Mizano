'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, isValid } from 'date-fns';
import { CalendarIcon, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useDateFnsLocale } from '@/lib/date-locale';
import { useCreateEmployee, useUpdateEmployee, Employee } from '@/lib/hooks/use-hr';

// Validation messages are keys under `hr.employees.editor.errors`.
const amountSchema = z
  .number({ invalid_type_error: 'amountInvalid', required_error: 'amountInvalid' })
  .min(0, 'amountInvalid');

const allowanceSchema = z.object({
  name: z.string().min(1, 'itemNameRequired'),
  amount: amountSchema,
});

const deductionSchema = z.object({
  name: z.string().min(1, 'itemNameRequired'),
  amount: amountSchema,
});

const employeeSchema = z.object({
  employeeNumber: z.string().min(1, 'employeeNumberRequired'),
  name: z.string().min(1, 'nameRequired'),
  email: z.string().email('emailInvalid'),
  phone: z.string().optional(),
  joiningDate: z.date({
    required_error: 'joiningDateRequired',
    invalid_type_error: 'joiningDateRequired',
  }),
  department: z.string().optional(),
  jobTitle: z.string().optional(),
  basicSalary: z
    .number({ invalid_type_error: 'salaryInvalid', required_error: 'salaryInvalid' })
    .min(0, 'salaryInvalid'),
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
  const t = useTranslations('hr.employees.editor');
  const tStatus = useTranslations('hr.employees.status');
  const tCommon = useTranslations('common');
  const dateLocale = useDateFnsLocale();
  const router = useRouter();
  const errorText = (message: string | undefined) =>
    message ? <p className="text-sm text-red-500">{t(`errors.${message}`)}</p> : null;
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
          employeeNumber: employee.employeeNumber ?? '',
          name: employee.name,
          email: employee.email ?? '',
          phone: employee.phone || '',
          joiningDate: employee.dateOfJoining ? new Date(employee.dateOfJoining) : new Date(),
          department: employee.department || '',
          jobTitle: employee.jobTitle || '',
          basicSalary:
            typeof employee.basicSalary === 'string'
              ? parseFloat(employee.basicSalary)
              : employee.basicSalary,
          allowances: allowancesToArray(employee.allowances as Record<string, number> | null),
          deductions: deductionsToArray(employee.deductions as Record<string, number> | null),
          bankName: employee.bankAccount || '',
          bankAccountNumber: '',
          taxId: employee.nationalId || '',
          status: (employee.status as 'ACTIVE' | 'INACTIVE' | 'TERMINATED') ?? 'ACTIVE',
        }
      : {
          employeeNumber: '',
          name: '',
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
          <CardTitle>{t('personalTitle')}</CardTitle>
          <CardDescription>{t('personalDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employeeNumber">{t('employeeNumber')} *</Label>
              <Input
                id="employeeNumber"
                placeholder="EMP-001"
                {...form.register('employeeNumber')}
              />
              {errorText(form.formState.errors.employeeNumber?.message)}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">{t('fullName')} *</Label>
              <Input id="name" placeholder={t('fullNamePlaceholder')} {...form.register('name')} />
              {errorText(form.formState.errors.name?.message)}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('email')} *</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                dir="ltr"
                {...form.register('email')}
              />
              {errorText(form.formState.errors.email?.message)}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t('phone')}</Label>
              <PhoneInput
                id="phone"
                value={form.watch('phone') || ''}
                onChange={(val) => form.setValue('phone', val)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t('joiningDate')} *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-start font-normal',
                      !form.watch('joiningDate') && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="me-2 h-4 w-4" />
                    {form.watch('joiningDate') && isValid(form.watch('joiningDate'))
                      ? format(form.watch('joiningDate'), 'PPP', { locale: dateLocale })
                      : t('pickDate')}
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
              {errorText(form.formState.errors.joiningDate?.message)}
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">{t('department')}</Label>
              <Input
                id="department"
                placeholder={t('departmentPlaceholder')}
                {...form.register('department')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="jobTitle">{t('jobTitle')}</Label>
              <Input
                id="jobTitle"
                placeholder={t('jobTitlePlaceholder')}
                {...form.register('jobTitle')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('status')}</Label>
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
                <SelectItem value="ACTIVE">{tStatus('active')}</SelectItem>
                <SelectItem value="INACTIVE">{tStatus('inactive')}</SelectItem>
                <SelectItem value="TERMINATED">{tStatus('terminated')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Salary Structure */}
      <Card>
        <CardHeader>
          <CardTitle>{t('salaryTitle')}</CardTitle>
          <CardDescription>{t('salaryDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="basicSalary">{t('basicSalary')} *</Label>
            <Input
              id="basicSalary"
              type="number"
              step="0.01"
              min="0"
              placeholder="5000.00"
              {...form.register('basicSalary', { valueAsNumber: true })}
            />
            {errorText(form.formState.errors.basicSalary?.message)}
          </div>

          {/* Allowances */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>{t('allowances')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendAllowance({ name: '', amount: 0 })}
              >
                <Plus className="h-4 w-4 me-1" />
                {t('addAllowance')}
              </Button>
            </div>
            {allowanceFields.length > 0 ? (
              <div className="space-y-2">
                {allowanceFields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-3">
                    <Input
                      placeholder={t('allowanceNamePlaceholder')}
                      aria-label={t('allowanceName')}
                      {...form.register(`allowances.${index}.name`)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      aria-label={t('allowanceAmount')}
                      {...form.register(`allowances.${index}.amount`, { valueAsNumber: true })}
                      className="w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAllowance(index)}
                      aria-label={t('removeAllowance')}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('noAllowances')}</p>
            )}
          </div>

          {/* Deductions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>{t('deductions')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendDeduction({ name: '', amount: 0 })}
              >
                <Plus className="h-4 w-4 me-1" />
                {t('addDeduction')}
              </Button>
            </div>
            {deductionFields.length > 0 ? (
              <div className="space-y-2">
                {deductionFields.map((field, index) => (
                  <div key={field.id} className="flex items-center gap-3">
                    <Input
                      placeholder={t('deductionNamePlaceholder')}
                      aria-label={t('deductionName')}
                      {...form.register(`deductions.${index}.name`)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      aria-label={t('deductionAmount')}
                      {...form.register(`deductions.${index}.amount`, { valueAsNumber: true })}
                      className="w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeDeduction(index)}
                      aria-label={t('removeDeduction')}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('noDeductions')}</p>
            )}
          </div>

          {/* Salary Summary */}
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <div className="flex justify-between">
              <span>{t('basicSalary')}</span>
              <span className="font-mono">{basicSalary.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span>{t('summaryAllowances')}</span>
              <span className="font-mono">{totalAllowances.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="font-medium">{t('grossSalary')}</span>
              <span className="font-mono font-medium">{grossSalary.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>{t('summaryDeductions')}</span>
              <span className="font-mono">{totalDeductions.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-lg">
              <span className="font-bold">{t('netSalary')}</span>
              <span className="font-mono font-bold">{netSalary.toLocaleString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Banking Details */}
      <Card>
        <CardHeader>
          <CardTitle>{t('bankTitle')}</CardTitle>
          <CardDescription>{t('bankDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bankName">{t('bankName')}</Label>
              <Input
                id="bankName"
                placeholder={t('bankNamePlaceholder')}
                {...form.register('bankName')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bankAccountNumber">{t('accountNumber')}</Label>
              <Input
                id="bankAccountNumber"
                placeholder="1234567890"
                {...form.register('bankAccountNumber')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxId">{t('taxId')}</Label>
              <Input id="taxId" placeholder="TAX-123456" {...form.register('taxId')} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tCommon('buttons.cancel')}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? tCommon('loading.saving') : employee ? t('submitUpdate') : t('submitCreate')}
        </Button>
      </div>
    </form>
  );
}
