import { Logger } from '@nestjs/common';
import { describeError } from '../../../common/utils/redact';
import { PrismaService } from '../../../prisma/prisma.service';

/** Organizations a scheduled AI job works on at the same time. */
const BATCH_SIZE = 5;

export interface OrganizationJob {
  /** Lower-case job name: "daily fraud scan" logs "Starting daily fraud scan..." and "Daily fraud scan completed". */
  name: string;
  /** What failed for one organization: "running fraud scan" logs "Error running fraud scan for org <id>: …". */
  failure: string;
  /** Completion line for jobs that report a total; defaults to "<Name> completed". */
  completed?: () => string;
}

/**
 * Runs one scheduled AI job for every organization, five at a time. A failing organization is
 * logged (ids and error class only) and never stops the others; a failure to list organizations
 * ends the run with one error line. Each `run` call is scoped to the organization it receives.
 */
export async function forEachOrganization(
  prisma: PrismaService,
  logger: Logger,
  job: OrganizationJob,
  run: (org: { id: string; name: string }) => Promise<void>,
): Promise<void> {
  const title = job.name.charAt(0).toUpperCase() + job.name.slice(1);
  logger.log(`Starting ${job.name}...`);
  try {
    const organizations = await prisma.organization.findMany({
      where: {},
      select: { id: true, name: true },
    });
    for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
      const results = await Promise.allSettled(
        organizations.slice(i, i + BATCH_SIZE).map(async (org) => {
          try {
            await run(org);
          } catch (error) {
            logger.error(`Error ${job.failure} for org ${org.id}: ${describeError(error)}`);
          }
        }),
      );
      for (const r of results) {
        if (r.status === 'rejected') {
          logger.error(`Scheduler batch rejection: ${describeError(r.reason)}`);
        }
      }
    }
    logger.log(job.completed?.() ?? `${title} completed`);
  } catch (error) {
    logger.error(`${title} failed: ${describeError(error)}`);
  }
}
