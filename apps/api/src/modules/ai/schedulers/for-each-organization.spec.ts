import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { forEachOrganization } from './for-each-organization';

describe('forEachOrganization', () => {
  const orgs = Array.from({ length: 7 }, (_, i) => ({ id: `org_${i}`, name: `Org ${i}` }));

  function setup(findMany = jest.fn().mockResolvedValue(orgs)) {
    const prisma = { organization: { findMany } } as unknown as PrismaService;
    const logger = { log: jest.fn(), error: jest.fn() } as unknown as Logger & {
      log: jest.Mock;
      error: jest.Mock;
    };
    return { prisma, logger, findMany };
  }

  it('visits every organization in batches of five and logs start and completion', async () => {
    const { prisma, logger, findMany } = setup();
    let active = 0;
    let peak = 0;
    const seen: string[] = [];
    await forEachOrganization(
      prisma,
      logger,
      { name: 'daily fraud scan', failure: 'running fraud scan' },
      async (org) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setImmediate(r));
        seen.push(org.id);
        active -= 1;
      },
    );
    expect(findMany).toHaveBeenCalledWith({ where: {}, select: { id: true, name: true } });
    expect(seen.sort()).toEqual(orgs.map((o) => o.id).sort());
    expect(peak).toBe(5);
    expect(logger.log.mock.calls).toEqual([
      ['Starting daily fraud scan...'],
      ['Daily fraud scan completed'],
    ]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs a failing organization by id and keeps going, with a custom completion line', async () => {
    const { prisma, logger } = setup();
    let done = 0;
    await forEachOrganization(
      prisma,
      logger,
      {
        name: 'daily AI alerts cleanup',
        failure: 'cleaning up alerts',
        completed: () => `Daily AI alerts cleanup completed. Cleaned ${done} alerts`,
      },
      async (org) => {
        if (org.id === 'org_2') throw new TypeError('boom');
        done += 1;
      },
    );
    expect(done).toBe(6);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][0]).toMatch(/^Error cleaning up alerts for org org_2: /);
    expect(logger.log).toHaveBeenLastCalledWith(
      'Daily AI alerts cleanup completed. Cleaned 6 alerts',
    );
  });

  it('ends with one failure line when organizations cannot be listed', async () => {
    const { prisma, logger } = setup(jest.fn().mockRejectedValue(new Error('db down')));
    const run = jest.fn();
    await forEachOrganization(prisma, logger, { name: 'weekly scan', failure: 'scanning' }, run);
    expect(run).not.toHaveBeenCalled();
    expect(logger.error.mock.calls[0][0]).toMatch(/^Weekly scan failed: /);
  });
});
