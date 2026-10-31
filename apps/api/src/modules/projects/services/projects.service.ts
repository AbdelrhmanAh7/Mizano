import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingMethod, Prisma, ProjectStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { InvoicesService } from '../../sales/services/invoices.service';
import { CreateProjectDto } from '../dto/create-project.dto';
import { UpdateProjectDto } from '../dto/update-project.dto';
import { ProjectQueryDto } from '../dto/project-query.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private invoices: InvoicesService,
  ) {}

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
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { projectNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          _count: { select: { tasks: true, timesheetEntries: true } },
          timesheetEntries: { select: { hours: true, duration: true } },
          invoices: { select: { total: true, grandTotal: true, balanceDue: true } },
          expenses: { select: { amount: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.project.count({ where }),
    ]);

    const data = projects.map((p) => {
      const totalHours = p.timesheetEntries.reduce(
        (sum, e) => sum + parseFloat((e.hours ?? e.duration ?? 0).toString()),
        0,
      );
      const totalBilled = p.invoices.reduce((sum, inv) => {
        const invTotal = parseFloat((inv.total ?? inv.grandTotal).toString());
        return sum + invTotal - parseFloat(inv.balanceDue.toString());
      }, 0);
      const totalExpenses = p.expenses.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
      const budgetAmount = p.budgetAmount ?? p.budget;
      const budgetType: 'HOURS' | 'COST' = p.budgetHours ? 'HOURS' : 'COST';
      const budgetNum = budgetAmount ? parseFloat(budgetAmount.toString()) : 0;
      const profitMargin =
        budgetNum > 0 ? Math.round(((totalBilled - totalExpenses) / budgetNum) * 100) : null;
      const { timesheetEntries: _te, invoices: _inv, expenses: _exp, ...rest } = p;
      return {
        ...rest,
        budgetAmount,
        budgetType,
        totalHours,
        totalBilled,
        totalExpenses,
        profitMargin,
      };
    });

    return { data, meta: { page: 1, limit: total, total, totalPages: 1 } };
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

    // Decimal hours and rate: the invoice command computes the line and totals exactly.
    const totalHours = entries.reduce(
      (sum, e) => sum.add(new Decimal((e.hours ?? e.duration).toString())),
      new Decimal(0),
    );
    const hourlyRate = project.hourlyRate ? new Decimal(project.hourlyRate.toString()) : null;
    const today = new Date();
    const dueDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000); // Net 30
    const day = (d: Date) => d.toISOString().slice(0, 10);

    // The one invoice command (org numbering, Decimal totals, tenant checks, invoice.created
    // event), with the entries marked billed in the same transaction (audit F3).
    return this.prisma.$transaction(async (tx) => {
      const invoice = await this.invoices.create(
        organizationId,
        {
          customerId: project.customerId as string,
          projectId,
          date: day(today),
          dueDate: day(dueDate),
          notes: `Time billed for ${project.name}: ${dto.startDate} to ${dto.endDate}`,
          lines: [
            {
              description: `Consulting services - ${project.name}`,
              quantity: totalHours.toFixed(4),
              rate: (hourlyRate ?? new Decimal(0)).toFixed(4),
            },
          ],
        },
        { tx },
      );
      const { count } = await tx.timesheetEntry.updateMany({
        where: { id: { in: entries.map((e) => e.id) }, organizationId, isBilled: false },
        data: { isBilled: true, invoiceId: invoice.id },
      });
      // A concurrent billing run took some of these entries: bill nothing twice.
      if (count !== entries.length) {
        throw new BadRequestException('Some time entries were billed meanwhile; try again');
      }
      return invoice;
    });
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
