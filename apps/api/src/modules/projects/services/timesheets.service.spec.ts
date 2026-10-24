import { BadRequestException } from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('TimesheetsService.create: hours input', () => {
  const ORG = 'org-1';
  let prisma: MockPrismaClient;
  let service: TimesheetsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new TimesheetsService(prisma as unknown as PrismaService);
    prisma.project.findFirst.mockResolvedValue({ id: 'p1' } as never);
  });

  it('rejects non-numeric hours with 400 and writes nothing', async () => {
    await expect(
      service.create(ORG, 'u1', { projectId: 'p1', date: '2026-03-01', hours: 'x' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.timesheetEntry.create).not.toHaveBeenCalled();
  });

  it('stores valid hours as Decimal on both duration and hours', async () => {
    prisma.timesheetEntry.create.mockResolvedValue({ id: 't1' } as never);
    await service.create(ORG, 'u1', { projectId: 'p1', date: '2026-03-01', hours: '7.5' });
    const data = (
      prisma.timesheetEntry.create.mock.calls[0][0] as {
        data: { hours: { toString(): string }; duration: { toString(): string } };
      }
    ).data;
    expect(data.hours.toString()).toBe('7.5');
    expect(data.duration.toString()).toBe('7.5');
  });
});

describe('TimesheetsService.update: hours input', () => {
  const ORG = 'org-1';
  let prisma: MockPrismaClient;
  let service: TimesheetsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new TimesheetsService(prisma as unknown as PrismaService);
    prisma.timesheetEntry.findFirst.mockResolvedValue({ id: 't1', isBilled: false } as never);
    prisma.timesheetEntry.update.mockResolvedValue({ id: 't1' } as never);
  });

  it('sets hours to 0 when 0 is supplied', async () => {
    await service.update(ORG, 't1', { hours: 0 });
    const { data } = prisma.timesheetEntry.update.mock.calls[0][0] as unknown as {
      data: { hours: { toString(): string } };
    };
    expect(data.hours.toString()).toBe('0');
  });

  it('rejects non-numeric hours with 400', async () => {
    await expect(service.update(ORG, 't1', { hours: 'x' })).rejects.toThrow(BadRequestException);
    expect(prisma.timesheetEntry.update).not.toHaveBeenCalled();
  });
});
