import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { AttendanceService } from './attendance.service';

describe('AttendanceService.getAttendanceByEmployee date range', () => {
  const setup = () => {
    const prisma = createMockPrisma();
    prisma.attendance.findMany.mockResolvedValue([]);
    return { prisma, service: new AttendanceService(prisma as unknown as PrismaService) };
  };
  const whereOf = (prisma: ReturnType<typeof setup>['prisma']) =>
    (prisma.attendance.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;

  it('lists every record when no range is given (no Invalid Date reaches Prisma)', async () => {
    const { prisma, service } = setup();
    await service.getAttendanceByEmployee('org', 'emp');
    expect(whereOf(prisma)).toEqual({ employeeId: 'emp', organizationId: 'org' });
  });

  it('applies only the bounds that were supplied', async () => {
    const { prisma, service } = setup();
    await service.getAttendanceByEmployee('org', 'emp', '2026-01-01', undefined);
    expect(whereOf(prisma)).toEqual({
      employeeId: 'emp',
      organizationId: 'org',
      date: { gte: new Date('2026-01-01') },
    });
  });

  it('applies both bounds', async () => {
    const { prisma, service } = setup();
    await service.getAttendanceByEmployee('org', 'emp', '2026-01-01', '2026-01-31');
    expect(whereOf(prisma).date).toEqual({
      gte: new Date('2026-01-01'),
      lte: new Date('2026-01-31'),
    });
  });
});
