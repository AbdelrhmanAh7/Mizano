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
});
