/**
 * Tests for WorkOrdersController route registration.
 * Regression: ensures the controller is mounted under /manufacturing/work-orders.
 */

import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { BulkIdsDto } from '../../../common/dto/bulk-ids.dto';
import { WorkOrdersService } from '../services/work-orders.service';
import { WorkOrdersController } from './work-orders.controller';

describe('WorkOrdersController', () => {
  it('should be registered at "manufacturing/work-orders" path', () => {
    const path = Reflect.getMetadata(PATH_METADATA, WorkOrdersController);
    expect(path).toBe('manufacturing/work-orders');
  });

  it('should have GET / route for findAll', () => {
    const metadata = Reflect.getMetadata(PATH_METADATA, WorkOrdersController.prototype.findAll);
    expect(metadata).toBe('/');
  });

  it('should have GET /:id route for findOne', () => {
    const metadata = Reflect.getMetadata(PATH_METADATA, WorkOrdersController.prototype.findOne);
    expect(metadata).toBe(':id');
  });

  it('should have POST / route for create', () => {
    const metadata = Reflect.getMetadata(PATH_METADATA, WorkOrdersController.prototype.create);
    expect(metadata).toBe('/');
  });

  it('should have PATCH /:id route for update (not PUT)', () => {
    const methodMetadata = Reflect.getMetadata('method', WorkOrdersController.prototype.update);
    const pathMetadata = Reflect.getMetadata(PATH_METADATA, WorkOrdersController.prototype.update);
    expect(pathMetadata).toBe(':id');
    // RequestMethod.PATCH = 4 in NestJS RequestMethod enum
    expect(methodMetadata).toBe(4);
  });

  it('should have POST /:id/start route', () => {
    const metadata = Reflect.getMetadata(PATH_METADATA, WorkOrdersController.prototype.start);
    expect(metadata).toBe(':id/start');
  });

  it('should have POST /:id/complete route', () => {
    const metadata = Reflect.getMetadata(PATH_METADATA, WorkOrdersController.prototype.complete);
    expect(metadata).toBe(':id/complete');
  });

  it('should have POST /:id/cancel route', () => {
    const metadata = Reflect.getMetadata(PATH_METADATA, WorkOrdersController.prototype.cancel);
    expect(metadata).toBe(':id/cancel');
  });

  describe('POST /bulk-complete', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });
    const meta: ArgumentMetadata = { type: 'body', metatype: BulkIdsDto };

    it('is routed at bulk-complete and validates its body as BulkIdsDto', () => {
      const proto = WorkOrdersController.prototype;
      expect(Reflect.getMetadata(PATH_METADATA, proto.bulkComplete)).toBe('bulk-complete');
      const [, body] = Reflect.getMetadata('design:paramtypes', proto, 'bulkComplete');
      expect(body).toBe(BulkIdsDto);
    });

    it('rejects an empty or malformed id list', async () => {
      await expect(pipe.transform({ ids: [] }, meta)).rejects.toThrow();
      await expect(pipe.transform({ ids: [1] }, meta)).rejects.toThrow();
      await expect(pipe.transform({}, meta)).rejects.toThrow();
      await expect(pipe.transform({ ids: ['wo-1'] }, meta)).resolves.toEqual({ ids: ['wo-1'] });
    });

    it('returns the per-order summary of the service', async () => {
      const summary = {
        processed: 1,
        total: 2,
        failures: [{ id: 'wo-2', reason: 'Work order not found' }],
      };
      const service = { bulkComplete: jest.fn().mockResolvedValue(summary) };
      const controller = new WorkOrdersController(service as unknown as WorkOrdersService);

      await expect(controller.bulkComplete('org', { ids: ['wo-1', 'wo-2'] })).resolves.toBe(
        summary,
      );
      expect(service.bulkComplete).toHaveBeenCalledWith('org', ['wo-1', 'wo-2']);
    });
  });
});
