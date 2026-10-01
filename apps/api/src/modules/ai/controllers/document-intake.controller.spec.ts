import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { firstValueFrom, take, toArray } from 'rxjs';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DocumentIntakeController } from './document-intake.controller';
import { DocumentIntakeService, IntakeJob } from '../services/document-intake.service';
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
    jobId: 'intake_1',
    organizationId: ORG_A,
    userId: 'user-1',
    forceType: 'BILL',
    status: 'extracting',
    progress: 20,
    result: null,
    error: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('DocumentIntakeController', () => {
  let service: {
    processDocumentAsync: jest.Mock;
    getJob: jest.Mock;
    confirmAndCreate: jest.Mock;
  };
  let emitter: EventEmitter2;
  let controller: DocumentIntakeController;

  beforeEach(() => {
    const job = makeJob();
    service = {
      processDocumentAsync: jest.fn().mockReturnValue('intake_1'),
      // Mirrors the service contract: only the owning organization sees the job.
      getJob: jest.fn((jobId: string, orgId: string) =>
        jobId === job.jobId && orgId === job.organizationId ? job : undefined,
      ),
      confirmAndCreate: jest.fn().mockResolvedValue({ type: 'bill', id: 'b1', number: 'BILL-1' }),
    };
    emitter = new EventEmitter2();
    controller = new DocumentIntakeController(service as unknown as DocumentIntakeService, emitter);
  });

  describe('route protection', () => {
    const reflector = new Reflector();
    const handlers = ['processDocument', 'streamProgress', 'getResult', 'confirmDocument'] as const;

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

  it('creates jobs owned by the current organization and user', () => {
    const file = {
      buffer: Buffer.from('x'),
      mimetype: 'image/png',
      originalname: 'a.png',
    } as Express.Multer.File;

    const res = controller.processDocument(ORG_A, 'user-1', file, {
      forceType: 'BILL',
      strategy: 'fast',
    });

    expect(res).toEqual({ data: { jobId: 'intake_1' } });
    expect(service.processDocumentAsync).toHaveBeenCalledWith(
      { organizationId: ORG_A, userId: 'user-1' },
      file.buffer,
      'image/png',
      expect.objectContaining({ forceType: 'BILL', strategy: 'fast' }),
    );
  });

  describe('getResult', () => {
    it('returns the job for the owning organization', () => {
      const res = controller.getResult(ORG_A, 'intake_1');
      expect(res.data).toMatchObject({ jobId: 'intake_1', status: 'extracting', progress: 20 });
      expect(service.getJob).toHaveBeenCalledWith('intake_1', ORG_A);
    });

    it('responds 404 (not 403) for another organization', () => {
      expect(() => controller.getResult(ORG_B, 'intake_1')).toThrow(NotFoundException);
    });

    it('responds 404 for an unknown job', () => {
      expect(() => controller.getResult(ORG_A, 'nope')).toThrow(NotFoundException);
    });
  });

  describe('streamProgress', () => {
    it('responds 404 for another organization without subscribing', () => {
      expect(() => controller.streamProgress(ORG_B, 'intake_1')).toThrow(NotFoundException);
      expect(emitter.listenerCount('document-intake.progress.intake_1')).toBe(0);
    });

    it('streams current state then live events for the owning organization', async () => {
      const stream = controller.streamProgress(ORG_A, 'intake_1');
      const eventsPromise = firstValueFrom(stream.pipe(take(2), toArray()));
      await new Promise((r) => setTimeout(r, 80));
      emitter.emit('document-intake.progress.intake_1', { stage: 'matching', progress: 80 });
      const events = await eventsPromise;
      expect(events.map((e) => (e.data as { stage: string }).stage)).toEqual([
        'extracting',
        'matching',
      ]);
      expect(emitter.listenerCount('document-intake.progress.intake_1')).toBe(0);
    });
  });

  it('confirm passes the current organization to the service', async () => {
    const dto = {
      type: 'BILL',
      vendorId: 'v1',
      date: '2026-09-01',
      dueDate: '2026-10-01',
      lines: [{ description: 'CPU', quantity: '2', rate: '100', taxRatePercent: '14' }],
    } as ConfirmIntakeDto;
    const res = await controller.confirmDocument(ORG_A, dto);
    expect(service.confirmAndCreate).toHaveBeenCalledWith(ORG_A, dto);
    expect(res.data.id).toBe('b1');
  });
});
