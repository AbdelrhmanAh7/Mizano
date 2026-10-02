import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { IntakeJobOwnerGuard } from './intake-job-owner.guard';
import { IntakeJobsService } from './intake-jobs.service';

function context(jobId: string, organizationId?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ params: { jobId }, user: { organizationId } }),
    }),
  } as unknown as ExecutionContext;
}

describe('IntakeJobOwnerGuard', () => {
  const jobs = {
    getForOrg: jest.fn(async (jobId: string, orgId: string) => {
      if (jobId === 'job-1' && orgId === 'org-a') return { id: jobId };
      throw new NotFoundException('Intake job not found');
    }),
  };
  const guard = new IntakeJobOwnerGuard(jobs as unknown as IntakeJobsService);

  it('allows the owning organization', async () => {
    await expect(guard.canActivate(context('job-1', 'org-a'))).resolves.toBe(true);
  });

  it('rejects another organization, unknown ids and missing organization with 404', async () => {
    await expect(guard.canActivate(context('job-1', 'org-b'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(guard.canActivate(context('nope', 'org-a'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(guard.canActivate(context('job-1'))).rejects.toBeInstanceOf(NotFoundException);
  });
});
