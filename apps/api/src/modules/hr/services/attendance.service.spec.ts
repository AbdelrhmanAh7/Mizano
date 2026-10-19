import { NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';

describe('AttendanceService.update', () => {
  const setup = () => {
    const prisma = createMockPrisma();
    const service = new AttendanceService(prisma as unknown as PrismaService);
    return { prisma, service };
  };

  it('throws NotFoundException for a record of another organization', async () => {
    const { prisma, service } = setup();
    prisma.attendance.findFirst.mockResolvedValue(null);

    await expect(service.update('org-a', 'att-1', { status: 'ABSENT' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.attendance.findFirst).toHaveBeenCalledWith({
      where: { id: 'att-1', organizationId: 'org-a' },
    });
    expect(prisma.attendance.update).not.toHaveBeenCalled();
  });

  it('only writes the editable fields and never moves the record to another tenant or employee', async () => {
    const { prisma, service } = setup();
    prisma.attendance.findFirst.mockResolvedValue({ id: 'att-1' } as never);
    prisma.attendance.update.mockResolvedValue({ id: 'att-1' } as never);

    await service.update('org-a', 'att-1', {
      status: 'ABSENT',
      notes: 'sick',
      checkIn: '2026-01-05T09:00:00Z',
      organizationId: 'org-b',
      employeeId: 'emp-of-org-b',
      id: 'other-id',
    });

    expect(prisma.attendance.update).toHaveBeenCalledWith({
      where: { id: 'att-1' },
      data: {
        status: 'ABSENT',
        notes: 'sick',
        checkIn: new Date('2026-01-05T09:00:00Z'),
      },
    });
  });

  describe('getAttendanceByEmployee', () => {
    it('queries without date filter when startDate and endDate are omitted', async () => {
      const { prisma, service } = setup();
      prisma.attendance.findMany.mockResolvedValue([{ id: 'att-1' }] as never);

      const result = await service.getAttendanceByEmployee('org-a', 'emp-1');

      expect(prisma.attendance.findMany).toHaveBeenCalledWith({
        where: {
          employeeId: 'emp-1',
          organizationId: 'org-a',
        },
        orderBy: { date: 'desc' },
      });
      expect(result).toHaveLength(1);
    });

    it('queries with date range when startDate and endDate are provided', async () => {
      const { prisma, service } = setup();
      prisma.attendance.findMany.mockResolvedValue([{ id: 'att-1' }] as never);

      await service.getAttendanceByEmployee('org-a', 'emp-1', '2026-01-01', '2026-01-31');

      expect(prisma.attendance.findMany).toHaveBeenCalledWith({
        where: {
          employeeId: 'emp-1',
          organizationId: 'org-a',
          date: { gte: new Date('2026-01-01'), lte: new Date('2026-01-31') },
        },
        orderBy: { date: 'desc' },
      });
    });
  });

  describe('getAttendanceSummary', () => {
    it('summarizes attendance with startDate and endDate strings', async () => {
      const { prisma, service } = setup();
      prisma.attendance.findMany.mockResolvedValue([
        {
          id: 'att-1',
          status: 'PRESENT',
          checkIn: new Date('2026-01-05T09:00:00Z'),
          checkOut: new Date('2026-01-05T17:00:00Z'),
        },
      ] as never);

      const summary = await service.getAttendanceSummary(
        'org-a',
        'emp-1',
        undefined,
        undefined,
        '2026-01-01',
        '2026-01-31',
      );

      expect(prisma.attendance.findMany).toHaveBeenCalledWith({
        where: {
          employeeId: 'emp-1',
          organizationId: 'org-a',
          date: { gte: new Date('2026-01-01'), lte: new Date('2026-01-31') },
        },
      });
      expect(summary.totalDays).toBe(1);
      expect(summary.presentDays).toBe(1);
      expect(summary.totalHoursWorked).toBe(8);
    });
  });
});
