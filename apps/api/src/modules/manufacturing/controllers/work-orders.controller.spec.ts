/**
 * Tests for WorkOrdersController route registration.
 * Regression: ensures the controller is mounted under /manufacturing/work-orders.
 */

import { INTERCEPTORS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { INVALIDATE_CACHE_KEY } from '../../../common/decorators/invalidate-cache.decorator';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
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

  it.each(['complete', 'bulkComplete'] as const)(
    'invalidates ledger caches after %s',
    (handler) => {
      const patterns = Reflect.getMetadata(
        INVALIDATE_CACHE_KEY,
        WorkOrdersController.prototype[handler],
      );
      expect(patterns).toEqual(
        expect.arrayContaining(['work-orders:*', 'reports:*', 'dashboard:*']),
      );
    },
  );

  it('registers the cache invalidation interceptor', () => {
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, WorkOrdersController)).toContain(
      CacheInvalidationInterceptor,
    );
  });
});
