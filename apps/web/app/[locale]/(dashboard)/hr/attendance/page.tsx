'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isWeekend,
} from 'date-fns';
import { ChevronLeft, ChevronRight, UserCheck, Clock, CalendarOff } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DataTable } from '@/components/data-table';
import { cn } from '@/lib/utils';
import {
  useEmployees,
  useAttendance,
  useBulkMarkAttendance,
  getAttendanceStatusLabel,
  getAttendanceStatusColor,
  AttendanceStatus,
} from '@/lib/hooks/use-hr';
import { useTranslations } from 'next-intl';

const attendanceStatuses: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY'];

function AttendancePageContent() {
  const t = useTranslations('hr');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const { data: employeesData, isLoading: employeesLoading } = useEmployees({ status: 'ACTIVE' });
  const { data: attendanceData, isLoading: attendanceLoading } = useAttendance(
    format(startOfMonth(currentMonth), 'yyyy-MM-dd'),
    format(endOfMonth(currentMonth), 'yyyy-MM-dd'),
  );
  const bulkMark = useBulkMarkAttendance();

  const employees = employeesData?.data || [];
  const attendance = attendanceData?.data || [];

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const getAttendanceForDay = (employeeId: string, date: Date) => {
    return attendance.find(
      (a: { employeeId: string; date: string }) =>
        a.employeeId === employeeId && isSameDay(new Date(a.date), date),
    );
  };

  const handleStatusChange = async (employeeId: string, date: Date, status: AttendanceStatus) => {
    await bulkMark.mutateAsync({
      date: format(date, 'yyyy-MM-dd'),
      entries: [{ employeeId, status }],
    });
  };

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  // Calculate summary for selected date
  const selectedDateAttendance = attendance.filter((a: { date: string; status: string }) =>
    isSameDay(new Date(a.date), selectedDate),
  );
  const presentCount = selectedDateAttendance.filter(
    (a: { status: string }) => a.status === 'PRESENT',
  ).length;
  const absentCount = selectedDateAttendance.filter(
    (a: { status: string }) => a.status === 'ABSENT',
  ).length;
  const leaveCount = selectedDateAttendance.filter(
    (a: { status: string }) => a.status === 'LEAVE',
  ).length;

  const isLoading = employeesLoading || attendanceLoading;

  // Columns for the selected date details table
  const detailColumns: ColumnDef<{
    id: string;
    name: string;
    jobTitle?: string;
  }>[] = [
    {
      accessorKey: 'name',
      header: t('attendance.table.employee'),
      cell: ({ row }) => {
        const employee = row.original;
        const nameParts = (employee.name || '').split(' ');
        const initials =
          nameParts.length >= 2
            ? nameParts[0][0] + nameParts[nameParts.length - 1][0]
            : (employee.name || '??').slice(0, 2);
        return (
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{employee.name}</p>
              <p className="text-xs text-muted-foreground">{employee.jobTitle}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: 'status',
      header: t('attendance.table.status'),
      cell: ({ row }) => {
        const att = getAttendanceForDay(row.original.id, selectedDate);
        return att ? (
          <Badge variant="outline" className={getAttendanceStatusColor(att.status)}>
            {getAttendanceStatusLabel(att.status)}
          </Badge>
        ) : (
          <span className="text-muted-foreground">{t('attendance.notMarked')}</span>
        );
      },
    },
    {
      id: 'checkIn',
      header: t('attendance.table.checkIn'),
      cell: ({ row }) => {
        const att = getAttendanceForDay(row.original.id, selectedDate);
        return att?.checkIn ? format(new Date(att.checkIn), 'HH:mm') : '-';
      },
    },
    {
      id: 'checkOut',
      header: t('attendance.table.checkOut'),
      cell: ({ row }) => {
        const att = getAttendanceForDay(row.original.id, selectedDate);
        return att?.checkOut ? format(new Date(att.checkOut), 'HH:mm') : '-';
      },
    },
    {
      id: 'notes',
      header: t('attendance.form.notes'),
      cell: ({ row }) => {
        const att = getAttendanceForDay(row.original.id, selectedDate);
        return att?.notes || '-';
      },
    },
    {
      id: 'action',
      header: t('attendance.action'),
      cell: ({ row }) => {
        const att = getAttendanceForDay(row.original.id, selectedDate);
        return (
          <Select
            value={att?.status ?? '__none__'}
            onValueChange={(value) => {
              if (value === '__none__') return;
              void handleStatusChange(row.original.id, selectedDate, value as AttendanceStatus);
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder={t('attendance.mark')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t('attendance.mark')}</SelectItem>
              {attendanceStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {getAttendanceStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('attendance.title')}</h1>
          <p className="text-muted-foreground">{t('attendance.description')}</p>
        </div>
        <Button asChild>
          <Link href="/hr/attendance/mark">
            <UserCheck className="mr-2 h-4 w-4" />
            {t('attendance.newAttendance')}
          </Link>
        </Button>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={previousMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-semibold min-w-[200px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setCurrentMonth(new Date());
            setSelectedDate(new Date());
          }}
        >
          {t('attendance.today')}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <UserCheck className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('attendance.totalEmployees')}</p>
                <p className="text-2xl font-bold">{employees.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <UserCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {t('attendance.presentOn', { date: format(selectedDate, 'MMM d') })}
                </p>
                <p className="text-2xl font-bold text-green-600">{presentCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <CalendarOff className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {t('attendance.absentOn', { date: format(selectedDate, 'MMM d') })}
                </p>
                <p className="text-2xl font-bold text-red-600">{absentCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {t('attendance.onLeaveOn', { date: format(selectedDate, 'MMM d') })}
                </p>
                <p className="text-2xl font-bold text-yellow-600">{leaveCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar View - kept as manual Table due to dynamic date columns */}
      <Card>
        <CardHeader>
          <CardTitle>{t('attendance.calendar')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background min-w-[200px]">
                    {t('attendance.table.employee')}
                  </TableHead>
                  {daysInMonth.map((day) => (
                    <TableHead
                      key={day.toISOString()}
                      className={cn(
                        'text-center min-w-[40px] cursor-pointer hover:bg-muted',
                        isWeekend(day) && 'bg-muted/50',
                        isSameDay(day, selectedDate) && 'bg-primary/10',
                      )}
                      onClick={() => setSelectedDate(day)}
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-muted-foreground">{format(day, 'EEE')}</span>
                        <span
                          className={cn(
                            'text-sm',
                            isSameDay(day, new Date()) &&
                              'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center',
                          )}
                        >
                          {format(day, 'd')}
                        </span>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee: { id: string; name: string }) => {
                  const nameParts = (employee.name || '').split(' ');
                  const initials =
                    nameParts.length >= 2
                      ? nameParts[0][0] + nameParts[nameParts.length - 1][0]
                      : (employee.name || '??').slice(0, 2);
                  return (
                    <TableRow key={employee.id}>
                      <TableCell className="sticky left-0 bg-background">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{employee.name}</span>
                        </div>
                      </TableCell>
                      {daysInMonth.map((day) => {
                        const att = getAttendanceForDay(employee.id, day);
                        const isSelected = isSameDay(day, selectedDate);
                        return (
                          <TableCell
                            key={day.toISOString()}
                            className={cn(
                              'text-center p-1',
                              isWeekend(day) && 'bg-muted/50',
                              isSelected && 'bg-primary/10',
                            )}
                          >
                            {att ? (
                              <Badge
                                variant="outline"
                                className={cn('text-xs px-1', getAttendanceStatusColor(att.status))}
                              >
                                {att.status === 'PRESENT' && 'P'}
                                {att.status === 'ABSENT' && 'A'}
                                {att.status === 'LEAVE' && 'L'}
                                {att.status === 'HALF_DAY' && 'H'}
                              </Badge>
                            ) : isWeekend(day) ? (
                              <span className="text-xs text-muted-foreground">-</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Selected Date Details */}
      <Card>
        <CardHeader>
          <CardTitle>{format(selectedDate, 'EEEE, MMMM d, yyyy')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={detailColumns}
            data={employees}
            isLoading={isLoading}
            emptyMessage={t('employees.empty.title')}
          />
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-green-100 text-green-800">
            P
          </Badge>
          <span>{t('attendance.status.present')}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-red-100 text-red-800">
            A
          </Badge>
          <span>{t('attendance.status.absent')}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
            L
          </Badge>
          <span>{t('attendance.status.leave')}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-orange-100 text-orange-800">
            H
          </Badge>
          <span>{t('attendance.status.halfDay')}</span>
        </div>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  return (
    <Suspense>
      <AttendancePageContent />
    </Suspense>
  );
}
