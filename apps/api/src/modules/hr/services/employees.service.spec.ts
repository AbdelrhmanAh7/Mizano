import { EmployeesService } from './employees.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';

describe('EmployeesService.findAll', () => {
  it('turns string page / limit query values into numbers for skip and take', async () => {
    const prisma = createMockPrisma();
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.employee.count.mockResolvedValue(0);
    const service = new EmployeesService(prisma as unknown as PrismaService);

    const result = await service.findAll('org-a', { page: '2', limit: '100' } as never);

    expect(prisma.employee.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-a', deletedAt: null },
      orderBy: { name: 'asc' },
      skip: 100,
      take: 100,
    });
    expect(result.meta).toEqual({ page: 2, limit: 100, total: 0, totalPages: 0 });
  });

  it('defaults to page 1 and 50 rows', async () => {
    const prisma = createMockPrisma();
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.employee.count.mockResolvedValue(0);
    const service = new EmployeesService(prisma as unknown as PrismaService);

    await service.findAll('org-a', {} as never);

    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 50 }),
    );
  });
});
