import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Every foreign id a CRM body carries (assignee, customer, lead) must belong to the caller's
 * organization; another tenant's id is reported as not found, exactly like an unknown one.
 */
export async function assertUserInOrg(
  prisma: PrismaService,
  organizationId: string,
  userId: string,
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: { id: true },
  });
  if (!user) throw new NotFoundException('Assigned user not found');
}

export async function assertCustomerInOrg(
  prisma: PrismaService,
  organizationId: string,
  customerId: string,
): Promise<void> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) throw new NotFoundException('Customer not found');
}

export async function assertLeadInOrg(
  prisma: PrismaService,
  organizationId: string,
  leadId: string,
): Promise<void> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!lead) throw new NotFoundException('Lead not found');
}
