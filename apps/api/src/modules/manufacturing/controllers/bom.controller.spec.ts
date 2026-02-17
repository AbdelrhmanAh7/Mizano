/**
 * Tests for BomController route registration.
 * Regression: ensures the controller is mounted under /manufacturing/bom (not /bom).
 */

import { PATH_METADATA } from '@nestjs/common/constants';
import { BomController } from './bom.controller';

describe('BomController', () => {
  it('should be registered at "manufacturing/bom" path', () => {
    const path = Reflect.getMetadata(PATH_METADATA, BomController);
    expect(path).toBe('manufacturing/bom');
  });

  it('should have GET / route for findAll', () => {
    const metadata = Reflect.getMetadata(PATH_METADATA, BomController.prototype.findAll);
    expect(metadata).toBe('/');
  });

  it('should have GET /:id route for findOne', () => {
    const metadata = Reflect.getMetadata(PATH_METADATA, BomController.prototype.findOne);
    expect(metadata).toBe(':id');
  });

  it('should have POST / route for create', () => {
    const metadata = Reflect.getMetadata(PATH_METADATA, BomController.prototype.create);
    expect(metadata).toBe('/');
  });

  it('should have PATCH /:id route for update (not PUT)', () => {
    const methodMetadata = Reflect.getMetadata('method', BomController.prototype.update);
    const pathMetadata = Reflect.getMetadata(PATH_METADATA, BomController.prototype.update);
    expect(pathMetadata).toBe(':id');
    // RequestMethod.PATCH = 4 in NestJS RequestMethod enum
    expect(methodMetadata).toBe(4); // PATCH
  });

  it('should have DELETE /:id route for remove', () => {
    const metadata = Reflect.getMetadata(PATH_METADATA, BomController.prototype.remove);
    expect(metadata).toBe(':id');
  });

  it('should have GET /:id/requirements route for calculateRequirements', () => {
    const metadata = Reflect.getMetadata(
      PATH_METADATA,
      BomController.prototype.calculateRequirements,
    );
    expect(metadata).toBe(':id/requirements');
  });

  it('should have POST /:id/duplicate route for duplicate', () => {
    const metadata = Reflect.getMetadata(PATH_METADATA, BomController.prototype.duplicate);
    expect(metadata).toBe(':id/duplicate');
  });
});
