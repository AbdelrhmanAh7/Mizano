import { EventEmitter2 } from '@nestjs/event-emitter';
import { BulkOperationsService } from './bulk-operations.service';
import { BulkActionType, BulkEntityType } from './dto/bulk-operation.dto';

const ORG_ID = 'org-test-001';
const OTHER_ORG_ID = 'org-test-002';
const FIXED_DATE = new Date('2024-06-15T00:00:00.000Z');

describe('BulkOperationsService', () => {
  let service: BulkOperationsService;
  let eventEmitter: EventEmitter2;
  let mockEmit: jest.Mock;
  let setIntervalSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    mockEmit = jest.fn();
    eventEmitter = { emit: mockEmit } as unknown as EventEmitter2;
    setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => ({}) as any);
    service = new BulkOperationsService(eventEmitter);
  });

  afterEach(() => {
    jest.useRealTimers();
    setIntervalSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('createJob', () => {
    it('should create a job with organizationId, initial pending state, and deterministic timestamp', () => {
      jest.setSystemTime(FIXED_DATE);
      const ids = ['id-1', 'id-2', 'id-3'];
      const job = service.createJob(ORG_ID, ids, BulkEntityType.INVOICES, BulkActionType.APPROVE);

      expect(job).toBeDefined();
      expect(job.jobId).toBeDefined();
      expect(job.organizationId).toBe(ORG_ID);
      expect(job.entityType).toBe(BulkEntityType.INVOICES);
      expect(job.action).toBe(BulkActionType.APPROVE);
      expect(job.status).toBe('pending');
      expect(job.ids).toEqual(ids);
      expect(job.processed).toBe(0);
      expect(job.total).toBe(3);
      expect(job.failures).toEqual([]);
      expect(job.startedAt.getTime()).toBe(FIXED_DATE.getTime());
      expect(job.completedAt).toBeUndefined();
    });

    it('should store created jobs in the internal map and generate unique job IDs', () => {
      const job1 = service.createJob(
        ORG_ID,
        ['id-1'],
        BulkEntityType.INVOICES,
        BulkActionType.APPROVE,
      );
      const job2 = service.createJob(
        OTHER_ORG_ID,
        ['id-2'],
        BulkEntityType.BILLS,
        BulkActionType.DELETE,
      );

      expect(service.getJob(job1.jobId)).toBe(job1);
      expect(service.getJob(job2.jobId)).toBe(job2);
      expect(job1.jobId).not.toBe(job2.jobId);
      expect(job1.organizationId).toBe(ORG_ID);
      expect(job2.organizationId).toBe(OTHER_ORG_ID);
    });
  });

  describe('getJob', () => {
    it('should return the job by jobId', () => {
      const created = service.createJob(
        ORG_ID,
        ['id-1'],
        BulkEntityType.EXPENSES,
        BulkActionType.PROCESS,
      );
      expect(service.getJob(created.jobId)).toBe(created);
    });

    it('should return undefined for non-existent jobId', () => {
      expect(service.getJob('non-existent-job-id')).toBeUndefined();
    });

    it('documents cross-tenant job lookup by jobId alone (security gap tracked in issue draft)', () => {
      const jobOrg1 = service.createJob(
        ORG_ID,
        ['id-1'],
        BulkEntityType.INVOICES,
        BulkActionType.APPROVE,
      );
      const jobOrg2 = service.createJob(
        OTHER_ORG_ID,
        ['id-2'],
        BulkEntityType.BILLS,
        BulkActionType.DELETE,
      );

      // getJob lookup is by jobId only; scoping to organizationId is tracked in follow-up security issue
      expect(service.getJob(jobOrg1.jobId)).toBe(jobOrg1);
      expect(service.getJob(jobOrg2.jobId)).toBe(jobOrg2);
    });
  });

  describe('processJob', () => {
    it('should process all items in chunks, emit progress events, and mark job completed', async () => {
      jest.setSystemTime(FIXED_DATE);
      const ids = ['id-1', 'id-2', 'id-3', 'id-4', 'id-5'];
      const job = service.createJob(ORG_ID, ids, BulkEntityType.INVOICES, BulkActionType.APPROVE);
      const processFn = jest.fn().mockResolvedValue(undefined);

      const processPromise = service.processJob(job.jobId, processFn, 2);
      await jest.runAllTimersAsync();
      const result = await processPromise;

      expect(result.jobId).toBe(job.jobId);
      expect(result.status).toBe('completed');
      expect(result.processed).toBe(5);
      expect(result.failures).toEqual([]);
      expect(result.completedAt).toBeInstanceOf(Date);
      // Advances by 100ms due to two 50ms inter-chunk delay promises
      expect(result.completedAt?.getTime()).toBe(FIXED_DATE.getTime() + 100);

      expect(processFn).toHaveBeenCalledTimes(5);
      expect(processFn).toHaveBeenNthCalledWith(1, 'id-1', 0);
      expect(processFn).toHaveBeenNthCalledWith(2, 'id-2', 1);
      expect(processFn).toHaveBeenNthCalledWith(3, 'id-3', 2);
      expect(processFn).toHaveBeenNthCalledWith(4, 'id-4', 3);
      expect(processFn).toHaveBeenNthCalledWith(5, 'id-5', 4);

      expect(mockEmit).toHaveBeenCalledWith(
        `bulk-operation.progress.${job.jobId}`,
        expect.objectContaining({
          jobId: job.jobId,
          status: 'running',
          processed: 0,
          total: 5,
          progress: 0,
        }),
      );
      expect(mockEmit).toHaveBeenCalledWith(
        `bulk-operation.progress.${job.jobId}`,
        expect.objectContaining({
          status: 'completed',
          processed: 5,
          total: 5,
          progress: 100,
        }),
      );
    });

    it('should handle partial failures and mark job as completed with failures', async () => {
      const job = service.createJob(
        ORG_ID,
        ['id-1', 'id-2', 'id-3'],
        BulkEntityType.JOURNALS,
        BulkActionType.DELETE,
      );

      const processFn = jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Item 2 failed'))
        .mockResolvedValueOnce(undefined);

      const processPromise = service.processJob(job.jobId, processFn);
      await jest.runAllTimersAsync();
      const result = await processPromise;

      expect(result.status).toBe('completed');
      expect(result.processed).toBe(3);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toMatchObject({ id: 'id-2', reason: 'Item 2 failed' });
    });

    it('should mark job as failed when all items fail', async () => {
      const job = service.createJob(
        ORG_ID,
        ['id-1', 'id-2'],
        BulkEntityType.QUOTES,
        BulkActionType.SEND,
      );

      const processFn = jest.fn().mockRejectedValue(new Error('All items failed'));

      const processPromise = service.processJob(job.jobId, processFn);
      await jest.runAllTimersAsync();
      const result = await processPromise;

      expect(result.status).toBe('failed');
      expect(result.processed).toBe(2);
      expect(result.failures).toHaveLength(2);
    });

    it('should throw when job does not exist', async () => {
      await expect(service.processJob('non-existent', jest.fn())).rejects.toThrow(
        'Job non-existent not found',
      );
    });

    it('documents cross-tenant job processing gap by jobId alone (tracked in security issue draft)', async () => {
      const jobOrg2 = service.createJob(
        OTHER_ORG_ID,
        ['id-2'],
        BulkEntityType.BILLS,
        BulkActionType.DELETE,
      );
      const processFn = jest.fn().mockResolvedValue(undefined);

      const processPromise = service.processJob(jobOrg2.jobId, processFn);
      await jest.runAllTimersAsync();
      const result = await processPromise;

      expect(result.status).toBe('completed');
    });
  });

  describe('chunkArray', () => {
    it('should correctly partition arrays into chunks including remainders and empty inputs', () => {
      const chunkArray = (service as any).chunkArray.bind(service);

      expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
      expect(chunkArray([1, 2], 5)).toEqual([[1, 2]]);
      expect(chunkArray([], 2)).toEqual([]);
      expect(chunkArray([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
    });
  });

  describe('cleanupStaleJobs', () => {
    it('should purge jobs older than TTL while preserving active jobs within TTL', () => {
      const oldJob = service.createJob(
        ORG_ID,
        ['old'],
        BulkEntityType.INVOICES,
        BulkActionType.APPROVE,
      );

      // Advance time past 10-minute TTL
      jest.advanceTimersByTime(11 * 60 * 1000);

      const newJob = service.createJob(
        ORG_ID,
        ['new'],
        BulkEntityType.BILLS,
        BulkActionType.DELETE,
      );

      (service as any).cleanupStaleJobs();

      expect(service.getJob(oldJob.jobId)).toBeUndefined();
      expect(service.getJob(newJob.jobId)).toBeDefined();
    });
  });

  describe('edge cases & determinism', () => {
    it('should handle empty ids array on job creation without errors', () => {
      const job = service.createJob(ORG_ID, [], BulkEntityType.INVOICES, BulkActionType.APPROVE);

      expect(job.total).toBe(0);
      expect(job.ids).toEqual([]);
      expect(job.status).toBe('pending');
    });
  });
});
