import { NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AgingReportsService } from '../../reports/services/aging-reports.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new CustomersService(prisma as unknown as PrismaService, {} as AgingReportsService);
  });

  describe('create', () => {
    it('maps nested addresses to flat street/city columns and omits address objects from prisma payload', async () => {
      const mockCustomer = { id: 'cust-1', name: 'Nile Corp' };
      prisma.customer.create.mockResolvedValueOnce(mockCustomer as any);

      const result = await service.create('org-1', {
        name: 'Nile Corp',
        displayName: 'Nile Corporation',
        email: 'info@nile.test',
        billingAddress: {
          street: '123 Nile Corniche',
          city: 'Cairo',
          state: 'Cairo Governorate',
          postalCode: '11511',
          country: 'Egypt',
        },
        shippingAddress: {
          street: '456 Port Said',
          city: 'Alexandria',
          state: 'Alexandria Governorate',
          postalCode: '21500',
          country: 'Egypt',
        },
      });

      expect(result).toBe(mockCustomer);
      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: {
          name: 'Nile Corp',
          displayName: 'Nile Corporation',
          email: 'info@nile.test',
          billingStreet: '123 Nile Corniche',
          billingCity: 'Cairo',
          billingState: 'Cairo Governorate',
          billingPostalCode: '11511',
          billingCountry: 'Egypt',
          shippingStreet: '456 Port Said',
          shippingCity: 'Alexandria',
          shippingState: 'Alexandria Governorate',
          shippingPostalCode: '21500',
          shippingCountry: 'Egypt',
          organizationId: 'org-1',
        },
      });
      // Ensure nested address objects are not passed directly to Prisma
      const createData = (prisma.customer.create as jest.Mock).mock.calls[0][0].data;
      expect(createData.billingAddress).toBeUndefined();
      expect(createData.shippingAddress).toBeUndefined();
    });
  });

  describe('update', () => {
    it('clears optional fields and nested address fields when passed null', async () => {
      prisma.customer.findFirst.mockResolvedValueOnce({
        id: 'cust-1',
        organizationId: 'org-1',
        name: 'Nile Corp',
      } as any);

      prisma.customer.update.mockResolvedValueOnce({
        id: 'cust-1',
        name: 'Nile Corp',
        displayName: null,
        email: null,
        billingStreet: null,
      } as any);

      await service.update('org-1', 'cust-1', {
        name: 'Nile Corp',
        displayName: null,
        email: null,
        phone: null,
        taxId: null,
        billingAddress: {
          street: null,
          city: null,
          state: null,
          postalCode: null,
          country: null,
        },
        shippingAddress: {
          street: null,
          city: null,
          state: null,
          postalCode: null,
          country: null,
        },
      });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: {
          name: 'Nile Corp',
          displayName: null,
          email: null,
          phone: null,
          taxId: null,
          billingStreet: null,
          billingCity: null,
          billingState: null,
          billingPostalCode: null,
          billingCountry: null,
          shippingStreet: null,
          shippingCity: null,
          shippingState: null,
          shippingPostalCode: null,
          shippingCountry: null,
        },
      });

      const updateData = (prisma.customer.update as jest.Mock).mock.calls[0][0].data;
      expect(updateData.billingAddress).toBeUndefined();
      expect(updateData.shippingAddress).toBeUndefined();
    });

    it('clears all address fields when billingAddress or shippingAddress is set to null', async () => {
      prisma.customer.findFirst.mockResolvedValueOnce({
        id: 'cust-1',
        organizationId: 'org-1',
      } as any);
      prisma.customer.update.mockResolvedValueOnce({ id: 'cust-1' } as any);

      await service.update('org-1', 'cust-1', {
        billingAddress: null,
        shippingAddress: null,
      });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: {
          billingStreet: null,
          billingCity: null,
          billingState: null,
          billingPostalCode: null,
          billingCountry: null,
          shippingStreet: null,
          shippingCity: null,
          shippingState: null,
          shippingPostalCode: null,
          shippingCountry: null,
        },
      });
    });

    it('does not touch address fields when address objects are undefined', async () => {
      prisma.customer.findFirst.mockResolvedValueOnce({
        id: 'cust-1',
        organizationId: 'org-1',
      } as any);
      prisma.customer.update.mockResolvedValueOnce({ id: 'cust-1' } as any);

      await service.update('org-1', 'cust-1', {
        displayName: 'Updated Name',
      });

      const updateData = (prisma.customer.update as jest.Mock).mock.calls[0][0].data;
      expect(updateData.displayName).toBe('Updated Name');
      expect(updateData.billingStreet).toBeUndefined();
      expect(updateData.shippingStreet).toBeUndefined();
      expect(updateData.billingAddress).toBeUndefined();
    });

    it('throws NotFoundException when customer does not exist', async () => {
      prisma.customer.findFirst.mockResolvedValueOnce(null);

      await expect(service.update('org-1', 'cust-missing', { name: 'Any' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
