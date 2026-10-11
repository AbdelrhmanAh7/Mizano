import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { TimesheetsService } from './timesheets.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';

describe('TimesheetsService', () => {
  const setup = () => {
    const prisma = createMockPrisma();
    const service = new TimesheetsService(prisma as unknown as PrismaService);
    return { prisma, service };
  };
  const entry = { date: '2026-03-09', projectId: 'proj-1' };

  describe('create hours validation', () => {
    it('stores valid hours as Decimal in both hours and duration', async () => {
      const { prisma, service } = setup();
      prisma.project.findFirst.mockResolvedValue({ id: 'proj-1' } as never);
      prisma.timesheetEntry.create.mockResolvedValue({ id: 'ts-1' } as never);

      await service.create('org-a', 'user-1', { ...entry, hours: '7.5' });

      const data = prisma.timesheetEntry.create.mock.calls[0][0].data;
      expect(data.hours).toBeInstanceOf(Decimal);
      expect(String(data.hours)).toBe('7.5');
      expect(String(data.duration)).toBe('7.5');
    });

    it.each([
      ['not a number', 'x'],
      ['empty', ''],
      ['negative', '-1'],
      ['NaN', Number.NaN],
      ['infinite', Number.POSITIVE_INFINITY],
      ['beyond Decimal(10,2)', '100000000'],
      ['an object', {}],
    ])('rejects %s hours with a BadRequestException instead of a 500', async (_name, hours) => {
      const { prisma, service } = setup();
      prisma.project.findFirst.mockResolvedValue({ id: 'proj-1' } as never);

      await expect(
        service.create('org-a', 'user-1', { ...entry, hours: hours as unknown as string }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.timesheetEntry.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a project of another organization', async () => {
      const { prisma, service } = setup();
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create('org-b', 'user-1', { ...entry, hours: '1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.project.findFirst).toHaveBeenCalledWith({
        where: { id: 'proj-1', organizationId: 'org-b' },
      });
    });
  });

  describe('update hours validation', () => {
    it('rejects invalid hours with a BadRequestException', async () => {
      const { prisma, service } = setup();
      prisma.timesheetEntry.findFirst.mockResolvedValue({ id: 'ts-1', isBilled: false } as never);

      await expect(service.update('org-a', 'ts-1', { hours: 'x' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.timesheetEntry.update).not.toHaveBeenCalled();
    });
  });

  describe('startTimer', () => {
    it('throws NotFoundException for a project of another organization and creates nothing', async () => {
      const { prisma, service } = setup();
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.startTimer('org-b', 'user-1', { projectId: 'proj-of-org-a' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.project.findFirst).toHaveBeenCalledWith({
        where: { id: 'proj-of-org-a', organizationId: 'org-b' },
        select: { id: true },
      });
      expect(prisma.timesheetEntry.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a task outside the project', async () => {
      const { prisma, service } = setup();
      prisma.project.findFirst.mockResolvedValue({ id: 'proj-1' } as never);
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(
        service.startTimer('org-a', 'user-1', { projectId: 'proj-1', taskId: 'task-x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.timesheetEntry.create).not.toHaveBeenCalled();
    });

    it('starts a timer for an own project', async () => {
      const { prisma, service } = setup();
      prisma.project.findFirst.mockResolvedValue({ id: 'proj-1' } as never);
      prisma.timesheetEntry.findFirst.mockResolvedValue(null);
      prisma.timesheetEntry.create.mockResolvedValue({ id: 'ts-1' } as never);

      await expect(service.startTimer('org-a', 'user-1', { projectId: 'proj-1' })).resolves.toEqual(
        {
          id: 'ts-1',
        },
      );
    });
  });
});
