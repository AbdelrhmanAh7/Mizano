import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmployeeCursorQueryDto } from '../dto/employee-cursor-query.dto';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any) {
    // Check for duplicate employee ID
    if (dto.employeeId) {
      const existing = await this.prisma.employee.findFirst({
        where: { organizationId, employeeId: dto.employeeId },
      });
      if (existing) throw new BadRequestException('Employee ID already exists');
    }

    const employeeId = dto.employeeId || (await this.generateEmployeeId(organizationId));

    return this.prisma.employee.create({
      data: {
        employeeId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        dateOfJoining: new Date(dto.dateOfJoining || dto.hireDate),
        department: dto.department,
        jobTitle: dto.jobTitle || dto.position,
        basicSalary: new Decimal(dto.basicSalary || dto.baseSalary || '0'),
        allowances: dto.allowances || {},
        deductions: dto.deductions || {},
        bankAccount: dto.bankAccount || dto.bankAccountNumber,
        isActive: dto.isActive !== false,
        organizationId,
      },
    });
  }

  async findAll(
    organizationId: string,
    query: PaginationDto & { isActive?: boolean; department?: string },
  ) {
    const {
      page = 1,
      limit = 50,
      sortBy = 'name',
      sortOrder = 'asc',
      isActive,
      department,
    } = query;
    const where: any = { organizationId };
    if (isActive !== undefined) where.isActive = isActive;
    if (department) where.department = department;

    const [employees, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return {
      data: employees,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAllCursor(organizationId: string, query: EmployeeCursorQueryDto) {
    const { cursor, take, sortBy = 'name', sortOrder = 'asc', isActive, department } = query;
    const where: any = { organizationId };
    if (isActive !== undefined) where.isActive = isActive;
    if (department) where.department = department;
    return cursorPaginate(this.prisma.employee, where, { [sortBy]: sortOrder }, { cursor, take });
  }

  async findOne(organizationId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId },
      include: {
        attendances: { take: 10, orderBy: { date: 'desc' } },
        payslips: { take: 10, orderBy: { payrollRunId: 'desc' } },
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  async update(organizationId: string, id: string, dto: any) {
    await this.findOne(organizationId, id);

    const data: any = { ...dto };
    if (dto.dateOfJoining) data.dateOfJoining = new Date(dto.dateOfJoining);
    if (dto.basicSalary) data.basicSalary = new Decimal(dto.basicSalary);

    return this.prisma.employee.update({ where: { id }, data });
  }

  async remove(organizationId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId },
      include: { payslips: { take: 1 } },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.payslips.length > 0) {
      throw new BadRequestException('Cannot delete employee with payroll history');
    }

    await this.prisma.employee.delete({ where: { id } });
    return { message: 'Employee deleted' };
  }

  async terminate(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.employee.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }

  async getActiveEmployeesCount(organizationId: string) {
    return this.prisma.employee.count({
      where: { organizationId, isActive: true },
    });
  }

  async getDepartmentSummary(organizationId: string) {
    const employees = await this.prisma.employee.groupBy({
      by: ['department'],
      where: { organizationId, isActive: true },
      _count: { id: true },
    });
    return employees.map((e) => ({ department: e.department || 'Unassigned', count: e._count.id }));
  }

  private async generateEmployeeId(organizationId: string): Promise<string> {
    const last = await this.prisma.employee.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { employeeId: true },
    });
    if (!last) return 'EMP-001';
    const num = parseInt(last.employeeId.split('-')[1], 10) || 0;
    return `EMP-${String(num + 1).padStart(3, '0')}`;
  }
}
