'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWeekend } from 'date-fns';
import { ChevronLeft, ChevronRight, UserCheck, Clock, CalendarOff } from 'lucide-react';
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
  useAttendance,
  useBulkMarkAttendance,
  getAttendanceStatusLabel,
  getAttendanceStatusColor,
  AttendanceStatus,
} from '@/lib/hooks/use-hr';

const attendanceStatuses: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY'];

export default function AttendancePage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const { data: employeesData, isLoading: employeesLoading } = useEmployees({ status: 'ACTIVE' });
  const { data: attendanceData, isLoading: attendanceLoading } = useAttendance(
    format(startOfMonth(currentMonth), 'yyyy-MM-dd'),
    format(endOfMonth(currentMonth), 'yyyy-MM-dd')
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
      (a: any) => a.employeeId === employeeId && isSameDay(new Date(a.date), date)
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
  const selectedDateAttendance = attendance.filter((a: any) =>
    isSameDay(new Date(a.date), selectedDate)
  );
  const presentCount = selectedDateAttendance.filter((a: any) => a.status === 'PRESENT').length;
  const absentCount = selectedDateAttendance.filter((a: any) => a.status === 'ABSENT').length;
  const leaveCount = selectedDateAttendance.filter((a: any) => a.status === 'LEAVE').length;

  const isLoading = employeesLoading || attendanceLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
          <p className="text-muted-foreground">
            Track employee attendance and working hours
          </p>
        </div>
        <Button asChild>
          <Link href="/hr/attendance/mark">
            <UserCheck className="mr-2 h-4 w-4" />
            Mark Attendance
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
          Today
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
                <p className="text-sm text-muted-foreground">Total Employees</p>
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
                  Present ({format(selectedDate, 'MMM d')})
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
                  Absent ({format(selectedDate, 'MMM d')})
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
                  On Leave ({format(selectedDate, 'MMM d')})
                </p>
                <p className="text-2xl font-bold text-yellow-600">{leaveCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar View */}
      <Card>
        <CardHeader>
          <CardTitle>Attendance Calendar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background min-w-[200px]">
                    Employee
                  </TableHead>
                  {daysInMonth.map((day) => (
                    <TableHead
                      key={day.toISOString()}
                      className={cn(
                        'text-center min-w-[40px] cursor-pointer hover:bg-muted',
                        isWeekend(day) && 'bg-muted/50',
                        isSameDay(day, selectedDate) && 'bg-primary/10'
                      )}
                      onClick={() => setSelectedDate(day)}
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-muted-foreground">
                          {format(day, 'EEE')}
                        </span>
                        <span className={cn(
                          'text-sm',
                          isSameDay(day, new Date()) && 'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center'
                        )}>
                          {format(day, 'd')}
                        </span>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee: any) => (
                  <TableRow key={employee.id}>
                    <TableCell className="sticky left-0 bg-background">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {employee.firstName[0]}
                            {employee.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">
                          {employee.firstName} {employee.lastName}
                        </span>
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
                            isSelected && 'bg-primary/10'
                          )}
                        >
                          {att ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs px-1',
                                getAttendanceStatusColor(att.status)
                              )}
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
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Selected Date Details */}
      <Card>
        <CardHeader>
          <CardTitle>
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee: any) => {
                const att = getAttendanceForDay(employee.id, selectedDate);
                return (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {employee.firstName[0]}
                            {employee.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {employee.firstName} {employee.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {employee.jobTitle}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {att ? (
                        <Badge
                          variant="outline"
                          className={getAttendanceStatusColor(att.status)}
                        >
                          {getAttendanceStatusLabel(att.status)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Not marked</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {att?.checkIn ? format(new Date(att.checkIn), 'HH:mm') : '-'}
                    </TableCell>
                    <TableCell>
                      {att?.checkOut ? format(new Date(att.checkOut), 'HH:mm') : '-'}
                    </TableCell>
                    <TableCell>
                      {att?.notes || '-'}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={att?.status || ''}
                        onValueChange={(value: AttendanceStatus) =>
                          handleStatusChange(employee.id, selectedDate, value)
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue placeholder="Mark" />
                        </SelectTrigger>
                        <SelectContent>
                          {attendanceStatuses.map((status) => (
                            <SelectItem key={status} value={status}>
                              {getAttendanceStatusLabel(status)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-green-100 text-green-800">P</Badge>
          <span>Present</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-red-100 text-red-800">A</Badge>
          <span>Absent</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800">L</Badge>
          <span>Leave</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-orange-100 text-orange-800">H</Badge>
          <span>Half Day</span>
        </div>
      </div>
    </div>
  );
}
