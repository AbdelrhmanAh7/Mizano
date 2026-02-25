import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AttendanceStatus } from '@prisma/client';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async clockIn(organizationId: string, employeeId: string, notes?: string) {
    // Verify employee exists
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already clocked in today
    const existing = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        organizationId,
        date: { gte: today, lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) },
      },
    });
    if (existing) throw new BadRequestException('Already clocked in today');

    return this.prisma.attendance.create({
      data: {
        employeeId,
        date: today,
        checkIn: new Date(),
        status: AttendanceStatus.PRESENT,
        notes,
        organizationId,
      },
    });
  }

  async clockOut(organizationId: string, employeeId: string, notes?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        organizationId,
        date: { gte: today, lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) },
        checkOut: null,
      },
    });
    if (!attendance) throw new BadRequestException('No clock-in record found for today');

    const checkOut = new Date();

    return this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOut,
        notes: notes || attendance.notes,
      },
    });
  }

  async recordAttendance(organizationId: string, dto: any) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, organizationId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    // Check for existing record
    const existing = await this.prisma.attendance.findFirst({
      where: {
        employeeId: dto.employeeId,
        organizationId,
        date,
      },
    });
    if (existing) throw new BadRequestException('Attendance already recorded for this date');

    return this.prisma.attendance.create({
      data: {
        employeeId: dto.employeeId,
        date,
        checkIn: dto.checkIn ? new Date(dto.checkIn) : null,
        checkOut: dto.checkOut ? new Date(dto.checkOut) : null,
        status: dto.status || AttendanceStatus.PRESENT,
        notes: dto.notes,
        organizationId,
      },
    });
  }

  async bulkRecordAttendance(organizationId: string, records: any[]) {
    const results: Array<{ success: boolean; record?: any; employeeId?: string; error?: string }> =
      [];
    for (const record of records) {
      try {
        const result = await this.recordAttendance(organizationId, record);
        results.push({ success: true, record: result });
      } catch (error: any) {
        results.push({ success: false, employeeId: record.employeeId, error: error.message });
      }
    }
    return results;
  }

  async getAttendanceByEmployee(
    organizationId: string,
    employeeId: string,
    startDate: string,
    endDate: string,
  ) {
    return this.prisma.attendance.findMany({
      where: {
        employeeId,
        organizationId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      orderBy: { date: 'desc' },
    });
  }

  async getAttendanceByDate(organizationId: string, date: string) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

    return this.prisma.attendance.findMany({
      where: {
        organizationId,
        date: { gte: targetDate, lt: nextDay },
      },
      include: {
        employee: { select: { id: true, name: true, employeeId: true } },
      },
      orderBy: { employee: { name: 'asc' } },
    });
  }

  async getAttendanceSummary(
    organizationId: string,
    employeeId: string,
    month: number,
    year: number,
  ) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const records = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        organizationId,
        date: { gte: startDate, lte: endDate },
      },
    });

    // Calculate hours worked from checkIn/checkOut
    const calculateHours = (checkIn: Date | null, checkOut: Date | null): number => {
      if (!checkIn || !checkOut) return 0;
      return (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
    };

    const summary = {
      totalDays: records.length,
      presentDays: records.filter((r) => r.status === AttendanceStatus.PRESENT).length,
      absentDays: records.filter((r) => r.status === AttendanceStatus.ABSENT).length,
      halfDays: records.filter((r) => r.status === AttendanceStatus.HALF_DAY).length,
      leaveDays: records.filter((r) => r.status === AttendanceStatus.LEAVE).length,
      totalHoursWorked: records.reduce((sum, r) => sum + calculateHours(r.checkIn, r.checkOut), 0),
    };

    return summary;
  }

  async update(organizationId: string, id: string, dto: any) {
    const attendance = await this.prisma.attendance.findFirst({
      where: { id, organizationId },
    });
    if (!attendance) throw new NotFoundException('Attendance record not found');

    const data: any = { ...dto };
    if (dto.date) data.date = new Date(dto.date);
    if (dto.checkIn) data.checkIn = new Date(dto.checkIn);
    if (dto.checkOut) data.checkOut = new Date(dto.checkOut);

    return this.prisma.attendance.update({ where: { id }, data });
  }

  async delete(organizationId: string, id: string) {
    const attendance = await this.prisma.attendance.findFirst({
      where: { id, organizationId },
    });
    if (!attendance) throw new NotFoundException('Attendance record not found');

    await this.prisma.attendance.delete({ where: { id } });
    return { message: 'Attendance record deleted' };
  }
}
