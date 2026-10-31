import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DealStage } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { ActivitiesService } from './activities.service';
import { DealsService } from './deals.service';
import { LeadsService } from './leads.service';

const ORG = 'org-1';

/** Foreign ids in CRM bodies must belong to the caller's organization (manual QA, item 6). */
describe('CRM foreign ids are checked against the organization', () => {
  let prisma: MockPrismaClient;
  let leads: LeadsService;
  let deals: DealsService;
  let activities: ActivitiesService;

  beforeEach(() => {
    prisma = createMockPrisma();
    leads = new LeadsService(prisma as unknown as PrismaService);
    deals = new DealsService(prisma as unknown as PrismaService);
    activities = new ActivitiesService(prisma as unknown as PrismaService);
    prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1', convertedToCustomerId: null } as never);
    prisma.deal.findFirst.mockResolvedValue({ id: 'deal-1', stage: DealStage.NEW } as never);
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' } as never);
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' } as never);
  });

  /** The user lookup is scoped by organization, so another tenant's user resolves to null. */
  const otherOrgUser = (): void => {
    prisma.user.findFirst.mockResolvedValue(null);
  };

  describe('leads', () => {
    it('refuses to assign a new lead to a user of another organization', async () => {
      otherOrgUser();
      await expect(
        leads.create(ORG, { leadName: 'Sara', assignedToId: 'user-x' }, 'me'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.user.findFirst.mock.calls[0][0]!.where).toEqual({
        id: 'user-x',
        organizationId: ORG,
      });
      expect(prisma.lead.create).not.toHaveBeenCalled();
    });

    it('refuses the same on update, assign and bulk assign', async () => {
      otherOrgUser();
      await expect(leads.update(ORG, 'lead-1', { assignedToId: 'user-x' })).rejects.toThrow(
        NotFoundException,
      );
      await expect(leads.assignLead(ORG, 'lead-1', 'user-x')).rejects.toThrow(NotFoundException);
      await expect(leads.bulkAssign(ORG, ['lead-1'], 'user-x')).rejects.toThrow(NotFoundException);
      expect(prisma.lead.update).not.toHaveBeenCalled();
      expect(prisma.lead.updateMany).not.toHaveBeenCalled();
    });

    it('bulk assign only touches the tenant leads and reports what really changed', async () => {
      prisma.lead.updateMany.mockResolvedValue({ count: 1 });
      await expect(leads.bulkAssign(ORG, ['lead-1', 'lead-of-org-2'], 'user-1')).resolves.toEqual({
        updated: 1,
      });
      expect(prisma.lead.updateMany.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG,
        deletedAt: null,
      });
    });

    it('update writes an explicit field list and ignores null for required columns', async () => {
      prisma.lead.update.mockResolvedValue({} as never);
      await leads.update(ORG, 'lead-1', { leadName: null, source: null, email: null } as never);
      const { data } = prisma.lead.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(data.leadName).toBeUndefined();
      expect(data.source).toBeUndefined();
      expect(data.email).toBeNull();
      expect(Object.keys(data)).not.toContain('organizationId');
    });

    it('convert creates the deal with the sent name and decimal amount', async () => {
      prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'EGP' } as never);
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue({ id: 'cust-1', name: 'Delta Co' } as never);
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        leadName: 'Sara',
        email: null,
        convertedToCustomerId: null,
        assignedToId: null,
      } as never);
      await leads.convertToCustomer(ORG, 'lead-1', {
        createDeal: true,
        dealName: 'First order',
        expectedAmount: '1200.50',
      });
      const { data } = prisma.deal.create.mock.calls[0][0] as {
        data: { dealName: string; expectedAmount: { toString(): string }; organizationId: string };
      };
      expect(data.dealName).toBe('First order');
      expect(data.expectedAmount.toString()).toBe('1200.5');
      expect(data.organizationId).toBe(ORG);
    });
  });

  describe('deals', () => {
    const body = { dealName: 'Deal', expectedAmount: '5000.00' };

    it('refuses a customer, lead or assignee of another organization on create', async () => {
      prisma.customer.findFirst.mockResolvedValueOnce(null);
      await expect(deals.create(ORG, { ...body, customerId: 'cust-x' }, 'me')).rejects.toThrow(
        'Customer not found',
      );
      prisma.lead.findFirst.mockResolvedValueOnce(null);
      await expect(deals.create(ORG, { ...body, leadId: 'lead-x' }, 'me')).rejects.toThrow(
        'Lead not found',
      );
      otherOrgUser();
      await expect(deals.create(ORG, { ...body, assignedToId: 'user-x' }, 'me')).rejects.toThrow(
        'Assigned user not found',
      );
      expect(prisma.deal.create).not.toHaveBeenCalled();
      expect(prisma.customer.findFirst.mock.calls[0][0]!.where).toEqual({
        id: 'cust-x',
        organizationId: ORG,
        deletedAt: null,
      });
      expect(prisma.lead.findFirst.mock.calls[0][0]!.where).toEqual({
        id: 'lead-x',
        organizationId: ORG,
        deletedAt: null,
      });
    });

    it('stores the decimal-string amount exactly', async () => {
      prisma.deal.create.mockResolvedValue({} as never);
      await deals.create(ORG, { ...body, expectedAmount: '1234.5678' }, 'me');
      const { data } = prisma.deal.create.mock.calls[0][0] as {
        data: { expectedAmount: { toString(): string }; organizationId: string };
      };
      expect(data.expectedAmount.toString()).toBe('1234.5678');
      expect(data.organizationId).toBe(ORG);
    });

    it('refuses another organization customer on update and on assign', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(deals.update(ORG, 'deal-1', { customerId: 'cust-x' })).rejects.toThrow(
        NotFoundException,
      );
      otherOrgUser();
      await expect(deals.assignDeal(ORG, 'deal-1', 'user-x')).rejects.toThrow(NotFoundException);
      expect(prisma.deal.update).not.toHaveBeenCalled();
    });

    it('a null link on update disconnects it instead of failing in Prisma', async () => {
      prisma.deal.update.mockResolvedValue({} as never);
      await deals.update(ORG, 'deal-1', { customerId: null, dealName: null } as never);
      const { data } = prisma.deal.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(data.customer).toEqual({ disconnect: true });
      expect(data).not.toHaveProperty('dealName');
    });
  });

  describe('activities', () => {
    it('needs a lead or a deal (400, not 404)', async () => {
      await expect(
        activities.create(ORG, { type: 'CALL', description: 'x' }, 'me'),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a lead of another organization', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        activities.logCall(ORG, 'me', { leadId: 'lead-x', description: 'x' }),
      ).rejects.toThrow('Lead not found');
      expect(prisma.activityLog.create).not.toHaveBeenCalled();
    });

    it('quick logs keep only the shared fields and set the type from the route', async () => {
      prisma.activityLog.create.mockResolvedValue({} as never);
      await activities.logMeeting(ORG, 'me', {
        dealId: 'deal-1',
        description: 'Kick-off',
        date: '2026-10-31T10:00:00.000Z',
      });
      const { data } = prisma.activityLog.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).toMatchObject({
        type: 'MEETING',
        dealId: 'deal-1',
        userId: 'me',
        organizationId: ORG,
      });
    });
  });
});
