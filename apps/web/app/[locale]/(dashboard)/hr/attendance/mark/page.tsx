'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, CalendarIcon, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  useEmployees,
  useBulkMarkAttendance,
  getAttendanceStatusLabel,
  AttendanceStatus,
} from '@/lib/hooks/use-hr';
import { useTranslations } from 'next-intl';
import { useDateFnsLocale } from '@/lib/date-locale';

const attendanceStatuses: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY'];

interface AttendanceEntry {
  employeeId: string;
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  notes?: string;
}

export default function MarkAttendancePage() {
  const t = useTranslations('hr');
  const tCommon = useTranslations('common');
  const dateLocale = useDateFnsLocale();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [entries, setEntries] = useState<Map<string, AttendanceEntry>>(new Map());
  const [selectAll, setSelectAll] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<AttendanceStatus>('PRESENT');

  const { data: employeesData, isLoading, isError, refetch } = useEmployees({ isActive: true });
  const bulkMark = useBulkMarkAttendance();

  const employees = employeesData?.data || [];

  const updateEntry = (employeeId: string, updates: Partial<AttendanceEntry>) => {
    setEntries((prev) => {
      const newEntries = new Map(prev);
      const existing = newEntries.get(employeeId) || {
        employeeId,
        status: defaultStatus,
      };
      newEntries.set(employeeId, { ...existing, ...updates });
      return newEntries;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      const newEntries = new Map<string, AttendanceEntry>();
      employees.forEach((emp: { id: string }) => {
        newEntries.set(emp.id, {
          employeeId: emp.id,
          status: defaultStatus,
        });
      });
      setEntries(newEntries);
    } else {
      setEntries(new Map());
    }
  };

  const handleDefaultStatusChange = (status: AttendanceStatus) => {
    setDefaultStatus(status);
    if (selectAll) {
      const newEntries = new Map<string, AttendanceEntry>();
      employees.forEach((emp: { id: string }) => {
        const existing = entries.get(emp.id);
        newEntries.set(emp.id, {
          employeeId: emp.id,
          status: status,
          checkIn: existing?.checkIn,
          checkOut: existing?.checkOut,
          notes: existing?.notes,
        });
      });
      setEntries(newEntries);
    }
  };

  const handleSubmit = async () => {
    if (entries.size === 0) return;

    const attendanceEntries = Array.from(entries.values());
    await bulkMark.mutateAsync({
      date: format(selectedDate, 'yyyy-MM-dd'),
      entries: attendanceEntries,
    });
    router.push('/hr/attendance');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12 space-y-4" role="alert">
        <p className="text-muted-foreground">{t('loadError')}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label={t('goBack')}>
          <Link href="/hr/attendance">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('attendance.newAttendance')}</h1>
          <p className="text-muted-foreground">{t('attendance.markPage.description')}</p>
        </div>
      </div>

      {/* Date Selection */}
      <Card>
        <CardHeader>
          <CardTitle>{t('attendance.markPage.selectDate')}</CardTitle>
          <CardDescription>{t('attendance.markPage.selectDateDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-64 justify-start text-start font-normal',
                  !selectedDate && 'text-muted-foreground',
                )}
              >
                <CalendarIcon className="me-2 h-4 w-4" />
                {selectedDate
                  ? format(selectedDate, 'PPP', { locale: dateLocale })
                  : t('attendance.markPage.pickDate')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      <Card>
        <CardHeader>
          <CardTitle>{t('attendance.markPage.quickActions')}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox id="selectAll" checked={selectAll} onCheckedChange={handleSelectAll} />
            <label htmlFor="selectAll" className="text-sm">
              {t('attendance.markPage.selectAll')}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t('attendance.markPage.defaultStatus')}
            </span>
            <Select value={defaultStatus} onValueChange={handleDefaultStatusChange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {attendanceStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {getAttendanceStatusLabel(status, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Employee List */}
      <Card>
        <CardHeader>
          <CardTitle>{t('attendance.markPage.employees')}</CardTitle>
          <CardDescription>
            {t('attendance.markPage.selectedCount', {
              selected: entries.size,
              total: employees.length,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>{t('attendance.table.employee')}</TableHead>
                <TableHead>{t('attendance.table.status')}</TableHead>
                <TableHead>{t('attendance.table.checkIn')}</TableHead>
                <TableHead>{t('attendance.table.checkOut')}</TableHead>
                <TableHead>{t('attendance.form.notes')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee: { id: string; name: string; jobTitle?: string }) => {
                const entry = entries.get(employee.id);
                const isSelected = !!entry;
                const nameParts = employee.name.split(' ');
                const initials =
                  nameParts.length >= 2
                    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`
                    : employee.name.slice(0, 2);
                return (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={t('attendance.markPage.selectEmployee', {
                          name: employee.name,
                        })}
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            updateEntry(employee.id, { status: defaultStatus });
                          } else {
                            setEntries((prev) => {
                              const newEntries = new Map(prev);
                              newEntries.delete(employee.id);
                              return newEntries;
                            });
                            setSelectAll(false);
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {initials.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{employee.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {employee.jobTitle || t('noTitle')}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={entry?.status || ''}
                        onValueChange={(value: AttendanceStatus) =>
                          updateEntry(employee.id, { status: value })
                        }
                        disabled={!isSelected}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue placeholder={t('attendance.markPage.selectStatus')} />
                        </SelectTrigger>
                        <SelectContent>
                          {attendanceStatuses.map((status) => (
                            <SelectItem key={status} value={status}>
                              {getAttendanceStatusLabel(status, t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="time"
                        value={entry?.checkIn || ''}
                        onChange={(e) => updateEntry(employee.id, { checkIn: e.target.value })}
                        disabled={!isSelected}
                        className="w-28"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="time"
                        value={entry?.checkOut || ''}
                        onChange={(e) => updateEntry(employee.id, { checkOut: e.target.value })}
                        disabled={!isSelected}
                        className="w-28"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder={t('attendance.markPage.notesPlaceholder')}
                        value={entry?.notes || ''}
                        onChange={(e) => updateEntry(employee.id, { notes: e.target.value })}
                        disabled={!isSelected}
                        className="w-40"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.back()}>
          {tCommon('buttons.cancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={entries.size === 0 || bulkMark.isPending}>
          <UserCheck className="me-2 h-4 w-4" />
          {bulkMark.isPending
            ? tCommon('loading.saving')
            : t('attendance.markPage.submit', { count: entries.size })}
        </Button>
      </div>
    </div>
  );
}
