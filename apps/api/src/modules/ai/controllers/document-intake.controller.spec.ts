import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IntakeJob, IntakeJobStatus } from '@prisma/client';
import { firstValueFrom, toArray } from 'rxjs';
import { DocumentIntakeController } from './document-intake.controller';
import { IntakeConfirmationService } from '../services/intake-confirmation.service';
import { IntakeJobOwnerGuard } from '../intake/intake-job-owner.guard';
import { IntakeJobsService } from '../intake/intake-jobs.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { OrganizationGuard } from '../../../common/guards/organization.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { ConfirmIntakeDto } from '../dto/document-intake.dto';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

function makeJob(overrides: Partial<IntakeJob> = {}): IntakeJob {
  return {
    id: 'job-1',
    organizationId: ORG_A,
    createdById: 'user-1',
    source: 'WEB',
    status: IntakeJobStatus.EXTRACTED,
    progress: 100,
    originalFileName: 'a.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 3,
    sha256: 'abc',
    storageKey: 'org-a/2026/09/secret-key',
    attempts: 1,
    maxAttempts: 3,
    lastError: null,
    result: { documentType: 'BILL' },
    forceType: null,
    strategy: null,
    language: null,
    leaseToken: null,
    leaseExpiresAt: null,
    draftDocumentType: null,
    draftDocumentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('DocumentIntakeController', () => {
  let service: { confirmAndCreate: jest.Mock };
  let jobs: {
    createFromUpload: jest.Mock;
    getForOrg: jest.Mock;
    list: jest.Mock;
    readOriginal: jest.Mock;
    retry: jest.Mock;
    claimForApproval: jest.Mock;
    linkDraft: jest.Mock;
    releaseApproval: jest.Mock;
    toView: jest.Mock;
  };
  let controller: DocumentIntakeController;

  beforeEach(() => {
    const job = makeJob();
    service = {
      confirmAndCreate: jest.fn().mockResolvedValue({ type: 'bill', id: 'b1', number: 'BILL-1' }),
    };
    jobs = {
      createFromUpload: jest.fn().mockResolvedValue({ job, duplicate: false }),
      // Mirrors the service contract: only the owning organization sees the job.
      getForOrg: jest.fn(async (jobId: string, orgId: string) => {
        if (jobId === job.id && orgId === job.organizationId) return job;
        throw new NotFoundException('Intake job not found');
      }),
      list: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      readOriginal: jest.fn(async (jobId: string, orgId: string) => {
        if (jobId === job.id && orgId === job.organizationId) {
          return { job, buffer: Buffer.from('pdf') };
        }
        throw new NotFoundException('Intake job not found');
      }),
      retry: jest.fn().mockResolvedValue(job),
      claimForApproval: jest.fn().mockResolvedValue(IntakeJobStatus.EXTRACTED),
      linkDraft: jest.fn().mockResolvedValue(undefined),
      releaseApproval: jest.fn().mockResolvedValue(undefined),
      toView: jest.fn((j: IntakeJob) => ({ id: j.id, status: j.status })),
    };
    controller = new DocumentIntakeController(
      service as unknown as IntakeConfirmationService,
      jobs as unknown as IntakeJobsService,
    );
  });

  describe('route protection', () => {
    const reflector = new Reflector();
    const handlers = [
      'processDocument',
      'listJobs',
      'streamProgress',
      'getResult',
      'getOriginal',
      'retryJob',
      'confirmDocument',
    ] as const;

    it('applies JwtAuthGuard, OrganizationGuard and PermissionsGuard at class level', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, DocumentIntakeController);
      expect(guards).toEqual([JwtAuthGuard, OrganizationGuard, PermissionsGuard]);
    });

    it.each(handlers)('%s is not public and requires a permission', (name) => {
      const handler = DocumentIntakeController.prototype[name];
      expect(reflector.get(IS_PUBLIC_KEY, handler)).toBeUndefined();
      expect(reflector.get(PERMISSIONS_KEY, handler)).toEqual(['purchases.create']);
    });
  });

  it('creates jobs owned by the current organization and user', async () => {
    const file = {
      buffer: Buffer.from('x'),
      mimetype: 'application/pdf',
      originalname: 'a.pdf',
    } as Express.Multer.File;

    const res = await controller.processDocument(ORG_A, 'user-1', file, {
      forceType: 'BILL',
      strategy: 'fast',
    });

    expect(res).toEqual({ data: { jobId: 'job-1', status: 'EXTRACTED', duplicate: false } });
    expect(jobs.createFromUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        userId: 'user-1',
        buffer: file.buffer,
        forceType: 'BILL',
        strategy: 'fast',
      }),
    );
  });

  describe('getResult', () => {
    it('returns the job view for the owning organization', async () => {
      const res = await controller.getResult(ORG_A, 'job-1');
      expect(res.data).toMatchObject({ id: 'job-1' });
      expect(jobs.getForOrg).toHaveBeenCalledWith('job-1', ORG_A);
    });

    it('responds 404 (not 403) for another organization', async () => {
      await expect(controller.getResult(ORG_B, 'job-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getOriginal', () => {
    it('streams the original with its content type for the owner', async () => {
      const res = { set: jest.fn() };
      const file = await controller.getOriginal(
        ORG_A,
        'job-1',
        res as unknown as Parameters<DocumentIntakeController['getOriginal']>[2],
      );
      expect(file).toBeDefined();
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/pdf',
          'X-Content-Type-Options': 'nosniff',
        }),
      );
    });

    it('responds 404 for another organization', async () => {
      await expect(
        controller.getOriginal(ORG_B, 'job-1', { set: jest.fn() } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('streamProgress', () => {
    it('is protected by IntakeJobOwnerGuard (404 before the stream opens)', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        DocumentIntakeController.prototype.streamProgress,
      );
      expect(guards).toEqual([IntakeJobOwnerGuard]);
    });

    it('emits the terminal state with the result for the owner, then completes', async () => {
      const stream = await controller.streamProgress(ORG_A, 'job-1');
      const events = await firstValueFrom(stream.pipe(toArray()));
      expect(events).toHaveLength(1);
      expect(events[0].data).toMatchObject({ stage: 'complete', status: 'EXTRACTED' });
    });
  });

  describe('confirm', () => {
    const dto = {
      type: 'BILL',
      vendorId: 'v1',
      date: '2026-09-01',
      dueDate: '2026-10-01',
      lines: [{ description: 'CPU', quantity: '2', rate: '100', taxRatePercent: '14' }],
    } as ConfirmIntakeDto;

    it('passes the current organization to the service', async () => {
      const res = await controller.confirmDocument(ORG_A, dto);
      expect(service.confirmAndCreate).toHaveBeenCalledWith(ORG_A, dto);
      expect(res.data.id).toBe('b1');
      expect(jobs.claimForApproval).not.toHaveBeenCalled();
    });

    it('claims the job once, creates the draft and links it', async () => {
      await controller.confirmDocument(ORG_A, { ...dto, jobId: 'job-1' });
      expect(jobs.claimForApproval).toHaveBeenCalledWith('job-1', ORG_A);
      expect(service.confirmAndCreate).toHaveBeenCalledWith(ORG_A, dto);
      expect(jobs.linkDraft).toHaveBeenCalledWith('job-1', ORG_A, { type: 'bill', id: 'b1' });
    });

    it('creates no draft when the job cannot be claimed (replay)', async () => {
      jobs.claimForApproval.mockRejectedValue(new ConflictException());
      await expect(controller.confirmDocument(ORG_A, { ...dto, jobId: 'job-1' })).rejects.toThrow(
        ConflictException,
      );
      expect(service.confirmAndCreate).not.toHaveBeenCalled();
    });

    it('releases the claim when draft creation fails', async () => {
      service.confirmAndCreate.mockRejectedValue(new Error('invalid'));
      await expect(controller.confirmDocument(ORG_A, { ...dto, jobId: 'job-1' })).rejects.toThrow(
        'invalid',
      );
      expect(jobs.releaseApproval).toHaveBeenCalledWith('job-1', ORG_A, IntakeJobStatus.EXTRACTED);
    });
  });

  it('keeps the job APPROVED (never reopens it) when linking a committed draft fails', async () => {
    jobs.linkDraft.mockRejectedValue(new Error('db down'));
    const dto = {
      type: 'BILL',
      vendorId: 'v1',
      date: '2026-09-01',
      dueDate: '2026-10-01',
      lines: [{ description: 'CPU', quantity: '2', rate: '100', taxRatePercent: '14' }],
      jobId: 'job-1',
    } as ConfirmIntakeDto;
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const res = await controller.confirmDocument(ORG_A, dto);
    expect(res.data.id).toBe('b1');
    expect(jobs.releaseApproval).not.toHaveBeenCalled();
  });

  it('retry delegates to the org-scoped service', async () => {
    await controller.retryJob(ORG_A, 'job-1');
    expect(jobs.retry).toHaveBeenCalledWith('job-1', ORG_A);
  });
});
