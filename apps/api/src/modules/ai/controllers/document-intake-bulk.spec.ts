import { ConflictException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IntakeJob, IntakeJobStatus } from '@prisma/client';
import { DocumentIntakeController } from './document-intake.controller';
import { DocumentIntakeService } from '../services/document-intake.service';
import { IntakeJobsService } from '../intake/intake-jobs.service';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { billResult } from '../intake/intake-test-utils';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

function job(
  id: string,
  status: IntakeJobStatus,
  org = ORG_A,
  result: unknown = billResult(),
): IntakeJob {
  return { id, organizationId: org, status, result, draftDocumentId: null } as unknown as IntakeJob;
}

describe('DocumentIntakeController.bulkApprove', () => {
  let rows: Map<string, IntakeJob>;
  let drafts: number;
  let controller: DocumentIntakeController;
  let intake: { confirmAndCreate: jest.Mock };

  beforeEach(() => {
    drafts = 0;
    rows = new Map(
      [
        job('ok1', IntakeJobStatus.EXTRACTED),
        job('ok2', IntakeJobStatus.EXTRACTED),
        job('review', IntakeJobStatus.NEEDS_REVIEW),
        job('failed', IntakeJobStatus.FAILED),
        job('done', IntakeJobStatus.APPROVED),
        job('foreign', IntakeJobStatus.EXTRACTED, ORG_B),
        job('novendor', IntakeJobStatus.EXTRACTED, ORG_A, billResult({ matchedVendor: null })),
      ].map((j) => [j.id, j]),
    );
    intake = {
      confirmAndCreate: jest.fn(async () => {
        drafts += 1;
        return { type: 'bill' as const, id: `bill-${drafts}`, number: `BILL-${drafts}` };
      }),
    };
    const jobs = {
      baseCurrency: jest.fn(async () => 'EGP'),
      getForOrg: jest.fn(async (id: string, org: string) => {
        const j = rows.get(id);
        if (!j || j.organizationId !== org) throw new NotFoundException('Intake job not found');
        return j;
      }),
      claimForApproval: jest.fn(async (id: string, org: string) => {
        const j = rows.get(id);
        if (!j || j.organizationId !== org) throw new NotFoundException('Intake job not found');
        if (j.status !== IntakeJobStatus.EXTRACTED && j.status !== IntakeJobStatus.NEEDS_REVIEW) {
          throw new ConflictException('cannot approve');
        }
        const previous = j.status;
        rows.set(id, { ...j, status: IntakeJobStatus.APPROVED });
        return previous;
      }),
      linkDraft: jest.fn().mockResolvedValue(undefined),
      releaseApproval: jest.fn(),
    };
    controller = new DocumentIntakeController(
      intake as unknown as DocumentIntakeService,
      jobs as unknown as IntakeJobsService,
    );
  });

  it('approves ready jobs and reports a reason per rejected record', async () => {
    const res = await controller.bulkApprove(ORG_A, {
      jobIds: ['ok1', 'ok2', 'review', 'failed', 'novendor'],
    });
    expect(res).toMatchObject({ processed: 2, total: 5 });
    expect(res.failures?.map((f) => f.id).sort()).toEqual(['failed', 'novendor', 'review']);
    expect(res.failures?.every((f) => f.reason.length > 0)).toBe(true);
    expect(drafts).toBe(2);
    expect(rows.get('review')?.status).toBe(IntakeJobStatus.NEEDS_REVIEW);
  });

  it('is idempotent: a second run creates no duplicate drafts', async () => {
    await controller.bulkApprove(ORG_A, { jobIds: ['ok1'] });
    const again = await controller.bulkApprove(ORG_A, { jobIds: ['ok1', 'done'] });
    expect(again.processed).toBe(0);
    expect(again.failures).toHaveLength(2);
    expect(drafts).toBe(1);
  });

  it('treats another organization id as a failure without approving it', async () => {
    const res = await controller.bulkApprove(ORG_A, { jobIds: ['foreign', 'ok1'] });
    expect(res.processed).toBe(1);
    expect(res.failures).toEqual([{ id: 'foreign', reason: 'Intake job not found' }]);
    expect(rows.get('foreign')?.status).toBe(IntakeJobStatus.EXTRACTED);
  });

  it('requires the same permission as the single confirm route', () => {
    const reflector = new Reflector();
    const bulk = reflector.get(PERMISSIONS_KEY, DocumentIntakeController.prototype.bulkApprove);
    const single = reflector.get(
      PERMISSIONS_KEY,
      DocumentIntakeController.prototype.confirmDocument,
    );
    expect(bulk).toEqual(single);
    expect(bulk).toEqual(['purchases.create']);
  });
});
