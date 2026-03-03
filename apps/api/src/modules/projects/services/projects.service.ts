import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingMethod, Prisma, ProjectStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateProjectDto } from '../dto/create-project.dto';
import { UpdateProjectDto } from '../dto/update-project.dto';
import { ProjectQueryDto } from '../dto/project-query.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateProjectDto) {
    const projectNumber = await this.generateProjectNumber(organizationId);

    // Verify customer if provided
    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, organizationId },
      });
      if (!customer) throw new NotFoundException('Customer not found');
    }

    return this.prisma.project.create({
      data: {
        projectNumber,
        name: dto.name,
        description: dto.description,
        customerId: dto.customerId,
        status: dto.status || ProjectStatus.PLANNING,
        billingMethod: dto.billingMethod || BillingMethod.HOURLY,
        hourlyRate: dto.hourlyRate ? new Decimal(dto.hourlyRate) : null,
        fixedPrice: dto.fixedPrice ? new Decimal(dto.fixedPrice) : null,
        budget: dto.budget ? new Decimal(dto.budget) : null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        color: dto.color || '#3B82F6',
        tags: dto.tags || [],
        organizationId,
      },
      include: {
        customer: { select: { id: true, name: true } },
      },
    });
  }

  async findAll(organizationId: string, query: ProjectQueryDto) {
    const where: Prisma.ProjectWhereInput = { organizationId, deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = query.customerId;

    return this.prisma.project.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        _count: { select: { tasks: true, timesheetEntries: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        customer: true,
        tasks: { orderBy: { sortOrder: 'asc' } },
        timesheetEntries: {
          take: 20,
          orderBy: { date: 'desc' },
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async update(organizationId: string, id: string, dto: UpdateProjectDto) {
    await this.findOne(organizationId, id);

    const data: Record<string, unknown> = { ...dto };
    if (dto.hourlyRate) data.hourlyRate = new Decimal(dto.hourlyRate);
    if (dto.fixedPrice) data.fixedPrice = new Decimal(dto.fixedPrice);
    if (dto.budget) data.budget = new Decimal(dto.budget);
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.endDate) data.endDate = new Date(dto.endDate);

    return this.prisma.project.update({
      where: { id },
      data,
      include: { customer: { select: { id: true, name: true } } },
    });
  }

  async remove(organizationId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId },
      include: {
        _count: { select: { timesheetEntries: true, invoices: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project._count.timesheetEntries > 0 || project._count.invoices > 0) {
      throw new BadRequestException('Cannot delete project with timesheet entries or invoices');
    }

    await this.prisma.task.updateMany({
      where: { projectId: id },
      data: { deletedAt: new Date() },
    });
    await this.prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Project deleted' };
  }

  // === Bulk Operations ===

  async bulkDelete(organizationId: string, ids: string[]) {
    // Only delete projects without timesheet entries or invoices
    const projects = await this.prisma.project.findMany({
      where: { id: { in: ids }, organizationId },
      include: { _count: { select: { timesheetEntries: true, invoices: true } } },
    });
    const deletableIds = projects
      .filter((p) => p._count.timesheetEntries === 0 && p._count.invoices === 0)
      .map((p) => p.id);
    await this.prisma.task.updateMany({
      where: { projectId: { in: deletableIds } },
      data: { deletedAt: new Date() },
    });
    const result = await this.prisma.project.updateMany({
      where: { id: { in: deletableIds }, organizationId },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count, total: ids.length };
  }

  async bulkUpdateStatus(organizationId: string, ids: string[], status: ProjectStatus) {
    const result = await this.prisma.project.updateMany({
      where: { id: { in: ids }, organizationId },
      data: { status },
    });
    return { updated: result.count, total: ids.length };
  }

  async getProjectProfitability(organizationId: string, id: string) {
    const project = await this.findOne(organizationId, id);

    // Get total hours logged
    const timesheetEntries = await this.prisma.timesheetEntry.findMany({
      where: { projectId: id, organizationId },
    });
    const totalHours = timesheetEntries.reduce(
      (sum, e) => sum + parseFloat((e.hours ?? e.duration).toString()),
      0,
    );

    // Calculate revenue based on billing method
    let revenue = 0;
    if (project.billingMethod === BillingMethod.HOURLY && project.hourlyRate) {
      revenue = totalHours * parseFloat(project.hourlyRate.toString());
    } else if (project.billingMethod === BillingMethod.FIXED && project.fixedPrice) {
      revenue = parseFloat(project.fixedPrice.toString());
    }

    // Get actual invoiced amount
    const invoices = await this.prisma.invoice.findMany({
      where: { projectId: id, organizationId },
    });
    const invoicedAmount = invoices.reduce(
      (sum, inv) => sum + parseFloat((inv.total ?? inv.grandTotal).toString()),
      0,
    );
    const paidAmount = invoices.reduce((sum, inv) => {
      const paid =
        parseFloat((inv.total ?? inv.grandTotal).toString()) -
        parseFloat(inv.balanceDue.toString());
      return sum + paid;
    }, 0);

    // Get expenses
    const expenses = await this.prisma.expense.findMany({
      where: { projectId: id, organizationId },
    });
    const totalExpenses = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount.toString()), 0);

    // Calculate profitability
    const budget = project.budget ? parseFloat(project.budget.toString()) : 0;
    const budgetUsed = budget > 0 ? ((invoicedAmount + totalExpenses) / budget) * 100 : 0;

    return {
      projectId: id,
      projectName: project.name,
      billingMethod: project.billingMethod,
      totalHours,
      hourlyRate: project.hourlyRate ? parseFloat(project.hourlyRate.toString()) : null,
      calculatedRevenue: revenue,
      invoicedAmount,
      paidAmount,
      outstandingAmount: invoicedAmount - paidAmount,
      totalExpenses,
      grossProfit: invoicedAmount - totalExpenses,
      budget,
      budgetUsedPercent: Math.round(budgetUsed * 100) / 100,
      isOverBudget: budgetUsed > 100,
    };
  }

  async getProjectSummary(organizationId: string) {
    const projects = await this.prisma.project.groupBy({
      by: ['status'],
      where: { organizationId, deletedAt: null },
      _count: { id: true },
    });

    const totalBudget = await this.prisma.project.aggregate({
      where: { organizationId, deletedAt: null },
      _sum: { budget: true },
    });

    return {
      byStatus: projects.map((p) => ({ status: p.status, count: p._count.id })),
      totalBudget: totalBudget._sum.budget || 0,
    };
  }

  async createInvoiceFromProject(
    organizationId: string,
    projectId: string,
    dto: { startDate: string; endDate: string },
  ) {
    const project = await this.findOne(organizationId, projectId);
    if (!project.customerId) {
      throw new BadRequestException('Project has no customer assigned');
    }

    // Get unbilled timesheet entries
    const entries = await this.prisma.timesheetEntry.findMany({
      where: {
        projectId,
        organizationId,
        isBilled: false,
        date: { gte: new Date(dto.startDate), lte: new Date(dto.endDate) },
      },
    });

    if (entries.length === 0) {
      throw new BadRequestException('No unbilled entries found for this period');
    }

    const totalHours = entries.reduce(
      (sum, e) => sum + parseFloat((e.hours ?? e.duration).toString()),
      0,
    );
    const hourlyRate = project.hourlyRate ? parseFloat(project.hourlyRate.toString()) : 0;

    // Generate invoice number
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true },
    });
    const invoiceNum = lastInvoice ? parseInt(lastInvoice.invoiceNumber.split('-')[1], 10) + 1 : 1;
    const invoiceNumber = `INV-${String(invoiceNum).padStart(3, '0')}`;

    // Create invoice
    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId: project.customerId,
        projectId,
        date: new Date(),
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Net 30
        subtotal: new Decimal(totalHours * hourlyRate),
        taxAmount: new Decimal(0),
        grandTotal: new Decimal(totalHours * hourlyRate),
        total: new Decimal(totalHours * hourlyRate),
        balanceDue: new Decimal(totalHours * hourlyRate),
        notes: `Time billed for ${project.name}: ${dto.startDate} to ${dto.endDate}`,
        organizationId,
        lines: {
          create: [
            {
              description: `Consulting services - ${project.name}`,
              quantity: new Decimal(totalHours),
              rate: new Decimal(hourlyRate),
              unitPrice: new Decimal(hourlyRate),
              amount: new Decimal(totalHours * hourlyRate),
              sortOrder: 0,
            },
          ],
        },
      },
    });

    // Mark entries as billed
    await this.prisma.timesheetEntry.updateMany({
      where: { id: { in: entries.map((e) => e.id) } },
      data: { isBilled: true },
    });

    return invoice;
  }

  private async generateProjectNumber(organizationId: string): Promise<string> {
    const last = await this.prisma.project.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { projectNumber: true },
    });
    if (!last || !last.projectNumber) return 'PRJ-001';
    const num = parseInt(last.projectNumber.split('-')[1], 10);
    return `PRJ-${String(num + 1).padStart(3, '0')}`;
  }
}
