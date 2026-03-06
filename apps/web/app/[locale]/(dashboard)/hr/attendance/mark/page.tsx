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

const attendanceStatuses: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY'];

interface AttendanceEntry {
  employeeId: string;
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  notes?: string;
}

export default function MarkAttendancePage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [entries, setEntries] = useState<Map<string, AttendanceEntry>>(new Map());
  const [selectAll, setSelectAll] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<AttendanceStatus>('PRESENT');

  const { data: employeesData, isLoading } = useEmployees({ status: 'ACTIVE' });
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/hr/attendance">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mark Attendance</h1>
          <p className="text-muted-foreground">Record attendance for multiple employees</p>
        </div>
      </div>

      {/* Date Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Date</CardTitle>
          <CardDescription>Choose the date for which you want to mark attendance</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-64 justify-start text-left font-normal',
                  !selectedDate && 'text-muted-foreground',
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
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
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox id="selectAll" checked={selectAll} onCheckedChange={handleSelectAll} />
            <label htmlFor="selectAll" className="text-sm">
              Select all employees
            </label>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Default status:</span>
            <Select value={defaultStatus} onValueChange={handleDefaultStatusChange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {attendanceStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {getAttendanceStatusLabel(status)}
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
          <CardTitle>Employees</CardTitle>
          <CardDescription>
            {entries.size} of {employees.length} employees selected
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map(
                (employee: {
                  id: string;
                  firstName: string;
                  lastName: string;
                  jobTitle?: string;
                }) => {
                  const entry = entries.get(employee.id);
                  const isSelected = !!entry;
                  return (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <Checkbox
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
                              {employee.firstName[0]}
                              {employee.lastName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {employee.firstName} {employee.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {employee.jobTitle || 'No title'}
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
                            <SelectValue placeholder="Select" />
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
                          placeholder="Notes"
                          value={entry?.notes || ''}
                          onChange={(e) => updateEntry(employee.id, { notes: e.target.value })}
                          disabled={!isSelected}
                          className="w-40"
                        />
                      </TableCell>
                    </TableRow>
                  );
                },
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={entries.size === 0 || bulkMark.isPending}>
          <UserCheck className="mr-2 h-4 w-4" />
          {bulkMark.isPending ? 'Saving...' : `Mark Attendance (${entries.size})`}
        </Button>
      </div>
    </div>
  );
}
