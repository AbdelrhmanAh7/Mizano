import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { AttendanceService } from './attendance.service';

describe('AttendanceService.getAttendanceSummary range', () => {
  const setup = (records: Array<Record<string, unknown>> = []) => {
    const prisma = createMockPrisma();
    prisma.attendance.findMany.mockResolvedValue(records as never);
    return { prisma, service: new AttendanceService(prisma as unknown as PrismaService) };
  };
  const whereOf = (prisma: ReturnType<typeof setup>['prisma']) =>
    (prisma.attendance.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;

  it('keeps the month/year contract', async () => {
    const { prisma, service } = setup();
    await service.getAttendanceSummary('org', 'emp', { month: 3, year: 2026 });
    expect(whereOf(prisma)).toEqual({
      employeeId: 'emp',
      organizationId: 'org',
      date: { gte: new Date(2026, 2, 1), lte: new Date(2026, 3, 0) },
    });
  });

  it('accepts startDate/endDate (the form the by-employee listing already takes)', async () => {
    const { prisma, service } = setup();
    await service.getAttendanceSummary('org', 'emp', {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    expect(whereOf(prisma).date).toEqual({
      gte: new Date('2026-01-01'),
      lte: new Date('2026-01-31'),
    });
  });

  it('prefers an explicit date range over month/year', async () => {
    const { prisma, service } = setup();
    await service.getAttendanceSummary('org', 'emp', {
      month: 3,
      year: 2026,
      startDate: '2026-01-01',
    });
    expect(whereOf(prisma).date).toEqual({ gte: new Date('2026-01-01') });
  });

  it('summarises all records when no range is given (no Invalid Date reaches Prisma)', async () => {
    const { prisma, service } = setup();
    await service.getAttendanceSummary('org', 'emp', {});
    expect(whereOf(prisma)).toEqual({ employeeId: 'emp', organizationId: 'org' });
  });

  it.each([
    [{ month: 13, year: 2026 }],
    [{ month: 0, year: 2026 }],
    [{ month: 3 }],
    [{ year: 2026 }],
    [{ startDate: 'not-a-date' }],
    [{ startDate: '2026-02-01', endDate: '2026-01-01' }],
  ])('rejects an invalid range %j with a 400', async (range) => {
    const { prisma, service } = setup();
    await expect(service.getAttendanceSummary('org', 'emp', range)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.attendance.findMany).not.toHaveBeenCalled();
  });

  it('counts statuses and hours over the selected records', async () => {
    const { service } = setup([
      {
        status: 'PRESENT',
        checkIn: new Date('2026-01-05T09:00:00Z'),
        checkOut: new Date('2026-01-05T17:00:00Z'),
      },
      { status: 'HALF_DAY', checkIn: null, checkOut: null },
      { status: 'ABSENT', checkIn: null, checkOut: null },
    ]);
    const summary = await service.getAttendanceSummary('org', 'emp', {});
    expect(summary).toEqual({
      totalDays: 3,
      presentDays: 1,
      absentDays: 1,
      halfDays: 1,
      leaveDays: 0,
      totalHoursWorked: 8,
    });
  });
});
