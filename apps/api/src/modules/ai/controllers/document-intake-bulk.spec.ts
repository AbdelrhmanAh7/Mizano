import { ConflictException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IntakeJob, IntakeJobStatus, Prisma } from '@prisma/client';
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
  const transaction = {} as Prisma.TransactionClient;
  let rows: Map<string, IntakeJob>;
  let drafts: number;
  let controller: DocumentIntakeController;
  let intake: { confirmAndCreate: jest.Mock; recordConfirmation: jest.Mock };
  let baseCurrency: jest.Mock;

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
      recordConfirmation: jest.fn().mockResolvedValue(undefined),
    };
    baseCurrency = jest.fn().mockResolvedValue('EGP');
    const jobs = {
      baseCurrency,
      getForOrg: jest.fn(async (id: string, org: string) => {
        const j = rows.get(id);
        if (!j || j.organizationId !== org) throw new NotFoundException('Intake job not found');
        return j;
      }),
      // Models IntakeJobsService.confirmWithApproval: the guarded claim and the draft commit
      // together, and a failed draft rolls the claim back.
      confirmWithApproval: jest.fn(
        async (
          id: string,
          org: string,
          createDraft: (tx: Prisma.TransactionClient) => Promise<unknown>,
        ) => {
          const j = rows.get(id);
          if (!j || j.organizationId !== org) throw new NotFoundException('Intake job not found');
          if (j.status !== IntakeJobStatus.EXTRACTED && j.status !== IntakeJobStatus.NEEDS_REVIEW) {
            throw new ConflictException('cannot approve');
          }
          rows.set(id, { ...j, status: IntakeJobStatus.APPROVED });
          try {
            return await createDraft(transaction);
          } catch (error) {
            rows.set(id, j);
            throw error;
          }
        },
      ),
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

  it('leaves a missing-currency job as an exception while approving a ready job', async () => {
    const base = billResult();
    rows.set(
      'no-currency',
      job('no-currency', IntakeJobStatus.EXTRACTED, ORG_A, {
        ...base,
        extractedFields: { ...base.extractedFields, currency: null },
      }),
    );
    const res = await controller.bulkApprove(ORG_A, { jobIds: ['no-currency', 'ok1'] });
    expect(res).toEqual({
      processed: 1,
      total: 2,
      failures: [
        {
          id: 'no-currency',
          reason: 'The document or organization currency is missing or does not match',
          code: 'CURRENCY_MISMATCH',
        },
      ],
    });
    expect(baseCurrency).toHaveBeenCalledTimes(1);
    expect(baseCurrency).toHaveBeenCalledWith(ORG_A);
    expect(drafts).toBe(1);
    expect(rows.get('no-currency')?.status).toBe(IntakeJobStatus.EXTRACTED);
    expect(intake.confirmAndCreate).toHaveBeenCalledWith(
      ORG_A,
      expect.objectContaining({ currencyCode: 'EGP', jobId: 'ok1' }),
      transaction,
    );
  });

  it('runs every record through the single-confirm transaction with the approving user', async () => {
    const res = await controller.bulkApprove(ORG_A, { jobIds: ['ok1', 'ok2'] }, 'actor-1');
    expect(res).toMatchObject({ processed: 2, total: 2 });
    expect(intake.confirmAndCreate).toHaveBeenCalledTimes(2);
    expect(intake.confirmAndCreate).toHaveBeenNthCalledWith(
      1,
      ORG_A,
      expect.objectContaining({ jobId: 'ok1', userId: 'actor-1' }),
      transaction,
    );
    expect(intake.confirmAndCreate).toHaveBeenNthCalledWith(
      2,
      ORG_A,
      expect.objectContaining({ jobId: 'ok2', userId: 'actor-1' }),
      transaction,
    );
    // Feedback and success logging happen once per committed draft, after the transaction.
    expect(intake.recordConfirmation).toHaveBeenCalledTimes(2);
    expect(intake.recordConfirmation).toHaveBeenCalledWith(
      ORG_A,
      expect.objectContaining({ vendorId: 'v1' }),
      { type: 'bill', id: 'bill-1', number: 'BILL-1' },
    );
  });

  it('reports a failed draft for that job only and leaves it ready', async () => {
    intake.confirmAndCreate.mockRejectedValueOnce(new Error('invalid'));
    const res = await controller.bulkApprove(ORG_A, { jobIds: ['ok1', 'ok2'] });
    expect(res).toMatchObject({ processed: 1, total: 2 });
    expect(res.failures?.map((f) => f.id)).toEqual(['ok1']);
    expect(rows.get('ok1')?.status).toBe(IntakeJobStatus.EXTRACTED);
    expect(rows.get('ok2')?.status).toBe(IntakeJobStatus.APPROVED);
    expect(intake.recordConfirmation).toHaveBeenCalledTimes(1);
  });

  it('reports one failure per job when the organization currency is unknown', async () => {
    baseCurrency.mockResolvedValue(null);
    const res = await controller.bulkApprove(ORG_A, { jobIds: ['ok1', 'ok2'] });
    expect(res).toEqual({
      processed: 0,
      total: 2,
      failures: ['ok1', 'ok2'].map((id) => ({
        id,
        reason: 'The document or organization currency is missing or does not match',
        code: 'CURRENCY_MISMATCH',
      })),
    });
    expect(drafts).toBe(0);
    expect(intake.confirmAndCreate).not.toHaveBeenCalled();
    expect(rows.get('ok1')?.status).toBe(IntakeJobStatus.EXTRACTED);
    expect(rows.get('ok2')?.status).toBe(IntakeJobStatus.EXTRACTED);
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
