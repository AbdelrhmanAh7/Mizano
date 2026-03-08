import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockEmployee } from '../../../test/helpers/test-utils';

describe('EmployeesService', () => {
  let service: EmployeesService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [EmployeesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
  });

  describe('create', () => {
    const validDto = {
      name: 'Jane Smith',
      email: 'jane@mizano.com',
      phone: '+1234567890',
      department: 'Engineering',
      jobTitle: 'Senior Developer',
      basicSalary: '8000',
      dateOfJoining: '2024-01-15',
      employeeId: 'EMP-010',
    };

    it('should create an employee with correct data', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);
      const mockEmployee = createMockEmployee({
        name: 'Jane Smith',
        employeeId: 'EMP-010',
      });
      prisma.employee.create.mockResolvedValue(mockEmployee as any);

      const result = await service.create(ORG_ID, validDto as any);

      expect(result).toBeDefined();
      expect(prisma.employee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Jane Smith',
            employeeId: 'EMP-010',
            organizationId: ORG_ID,
          }),
        }),
      );
    });

    it('should always include organizationId in the created record', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.employee.create.mockResolvedValue(createMockEmployee() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.employee.create.mock.calls[0]![0] as any;
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });

    it('should store basicSalary as Decimal', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.employee.create.mockResolvedValue(createMockEmployee() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.employee.create.mock.calls[0]![0] as any;
      expect(createCall.data.basicSalary).toBeInstanceOf(Decimal);
    });

    it('should throw BadRequestException when employeeId already exists', async () => {
      prisma.employee.findFirst.mockResolvedValue(createMockEmployee() as any);

      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(BadRequestException);
      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(
        'Employee ID already exists',
      );
    });

    it('should check employeeId uniqueness within organization', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.employee.create.mockResolvedValue(createMockEmployee() as any);

      await service.create(ORG_ID, validDto as any);

      expect(prisma.employee.findFirst).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, employeeId: 'EMP-010' },
      });
    });

    it('should auto-generate employeeId when not provided', async () => {
      const dtoWithoutId = { ...validDto, employeeId: undefined };
      // No existing employee with this ID
      prisma.employee.findFirst.mockResolvedValueOnce({ employeeId: 'EMP-005' } as any); // generateEmployeeId query
      prisma.employee.create.mockResolvedValue(createMockEmployee() as any);

      await service.create(ORG_ID, dtoWithoutId as any);

      const createCall = prisma.employee.create.mock.calls[0]![0] as any;
      expect(createCall.data.employeeId).toBe('EMP-006');
    });

    it('should generate EMP-001 for the first employee', async () => {
      const dtoWithoutId = { ...validDto, employeeId: undefined };
      prisma.employee.findFirst.mockResolvedValue(null); // no existing employees
      prisma.employee.create.mockResolvedValue(createMockEmployee() as any);

      await service.create(ORG_ID, dtoWithoutId as any);

      const createCall = prisma.employee.create.mock.calls[0]![0] as any;
      expect(createCall.data.employeeId).toBe('EMP-001');
    });

    it('should default isActive to true', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.employee.create.mockResolvedValue(createMockEmployee() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.employee.create.mock.calls[0]![0] as any;
      expect(createCall.data.isActive).toBe(true);
    });

    it('should default basicSalary to 0 when not provided', async () => {
      const dtoWithoutSalary = { ...validDto, basicSalary: undefined, baseSalary: undefined };
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.employee.create.mockResolvedValue(createMockEmployee() as any);

      await service.create(ORG_ID, dtoWithoutSalary as any);

      const createCall = prisma.employee.create.mock.calls[0]![0] as any;
      expect((createCall.data.basicSalary as Decimal).equals(new Decimal('0'))).toBe(true);
    });
  });

  describe('findAll', () => {
    it('should return paginated employees with meta', async () => {
      const employees = [
        createMockEmployee(),
        createMockEmployee({ id: 'emp-2', name: 'Employee 2' }),
      ];
      prisma.employee.findMany.mockResolvedValue(employees as any);
      prisma.employee.count.mockResolvedValue(2);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 50 });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, limit: 50, total: 2, totalPages: 1 });
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.employee.findMany.mockResolvedValue([]);
      prisma.employee.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.employee.findMany.mock.calls[0]![0] as any;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });

    it('should filter by isActive when provided', async () => {
      prisma.employee.findMany.mockResolvedValue([]);
      prisma.employee.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { isActive: true });

      const findCall = prisma.employee.findMany.mock.calls[0]![0] as any;
      expect(findCall.where!.isActive).toBe(true);
    });

    it('should filter by department when provided', async () => {
      prisma.employee.findMany.mockResolvedValue([]);
      prisma.employee.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { department: 'Engineering' });

      const findCall = prisma.employee.findMany.mock.calls[0]![0] as any;
      expect(findCall.where!.department).toBe('Engineering');
    });

    it('should apply pagination offset correctly', async () => {
      prisma.employee.findMany.mockResolvedValue([]);
      prisma.employee.count.mockResolvedValue(100);

      await service.findAll(ORG_ID, { page: 3, limit: 20 });

      const findCall = prisma.employee.findMany.mock.calls[0]![0] as any;
      expect(findCall.skip).toBe(40); // (3 - 1) * 20
      expect(findCall.take).toBe(20);
    });
  });

  describe('findOne', () => {
    it('should return an employee by id with attendances and payslips', async () => {
      const employee = createMockEmployee({
        id: 'emp-1',
        attendances: [],
        payslips: [],
      });
      prisma.employee.findFirst.mockResolvedValue(employee as any);

      const result = await service.findOne(ORG_ID, 'emp-1');

      expect(result.id).toBe('emp-1');
    });

    it('should throw NotFoundException when employee does not exist', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow('Employee not found');
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'emp-1');
      } catch {
        // Expected
      }

      const findCall = prisma.employee.findFirst.mock.calls[0]![0] as any;
      expect(findCall.where!.id).toBe('emp-1');
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });

    it('should include recent attendances and payslips', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'emp-1');
      } catch {
        // Expected
      }

      const findCall = prisma.employee.findFirst.mock.calls[0]![0] as any;
      expect(findCall.include!.attendances).toEqual({ take: 10, orderBy: { date: 'desc' } });
      expect(findCall.include!.payslips).toEqual({ take: 10, orderBy: { payrollRunId: 'desc' } });
    });
  });

  describe('update', () => {
    it('should update an employee', async () => {
      const employee = createMockEmployee({ id: 'emp-1' });
      prisma.employee.findFirst.mockResolvedValue(employee as any);
      prisma.employee.update.mockResolvedValue({
        ...employee,
        name: 'Updated Name',
      } as any);

      const result = await service.update(ORG_ID, 'emp-1', { name: 'Updated Name' } as any);

      expect(result.name).toBe('Updated Name');
    });

    it('should throw NotFoundException when employee does not exist', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ORG_ID, 'nonexistent', { name: 'Updated' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should convert basicSalary to Decimal when updating', async () => {
      const employee = createMockEmployee({ id: 'emp-1' });
      prisma.employee.findFirst.mockResolvedValue(employee as any);
      prisma.employee.update.mockResolvedValue(employee as any);

      await service.update(ORG_ID, 'emp-1', { basicSalary: '9000' } as any);

      const updateCall = prisma.employee.update.mock.calls[0]![0] as any;
      expect(updateCall.data.basicSalary).toBeInstanceOf(Decimal);
    });

    it('should convert dateOfJoining to Date when updating', async () => {
      const employee = createMockEmployee({ id: 'emp-1' });
      prisma.employee.findFirst.mockResolvedValue(employee as any);
      prisma.employee.update.mockResolvedValue(employee as any);

      await service.update(ORG_ID, 'emp-1', { dateOfJoining: '2024-06-01' } as any);

      const updateCall = prisma.employee.update.mock.calls[0]![0] as any;
      expect(updateCall.data.dateOfJoining).toBeInstanceOf(Date);
    });
  });

  describe('remove', () => {
    it('should soft-delete an employee without payroll history', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        ...createMockEmployee(),
        _count: { payslips: 0 },
      } as any);
      prisma.employee.update.mockResolvedValue({} as any);

      const result = await service.remove(ORG_ID, 'emp-test-001');

      expect(result.message).toBe('Employee deleted');
      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('should throw NotFoundException when employee does not exist', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow('Employee not found');
    });

    it('should throw BadRequestException when employee has payroll history', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        ...createMockEmployee(),
        _count: { payslips: 3 },
      } as any);

      await expect(service.remove(ORG_ID, 'emp-test-001')).rejects.toThrow(BadRequestException);
      await expect(service.remove(ORG_ID, 'emp-test-001')).rejects.toThrow(
        'Cannot delete employee with payroll history',
      );
    });

    it('should never hard-delete employees', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        ...createMockEmployee(),
        _count: { payslips: 0 },
      } as any);
      prisma.employee.update.mockResolvedValue({} as any);

      await service.remove(ORG_ID, 'emp-test-001');

      expect(prisma.employee.delete).not.toHaveBeenCalled();
      expect(prisma.employee.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('terminate', () => {
    it('should set isActive to false', async () => {
      const employee = createMockEmployee({ id: 'emp-1' });
      prisma.employee.findFirst.mockResolvedValue(employee as any);
      prisma.employee.update.mockResolvedValue({
        ...employee,
        isActive: false,
      } as any);

      const result = await service.terminate(ORG_ID, 'emp-1');

      expect(result.isActive).toBe(false);
      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: { isActive: false },
      });
    });

    it('should throw NotFoundException when employee does not exist', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.terminate(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getActiveEmployeesCount', () => {
    it('should return count of active employees for organization', async () => {
      prisma.employee.count.mockResolvedValue(15);

      const result = await service.getActiveEmployeesCount(ORG_ID);

      expect(result).toBe(15);
      expect(prisma.employee.count).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, isActive: true },
      });
    });
  });

  describe('getDepartmentSummary', () => {
    it('should return department counts', async () => {
      prisma.employee.groupBy.mockResolvedValue([
        { department: 'Engineering', _count: { id: 10 } },
        { department: 'Sales', _count: { id: 5 } },
        { department: null, _count: { id: 2 } },
      ] as any);

      const result = await service.getDepartmentSummary(ORG_ID);

      expect(result).toEqual([
        { department: 'Engineering', count: 10 },
        { department: 'Sales', count: 5 },
        { department: 'Unassigned', count: 2 },
      ]);
    });

    it('should filter by organizationId and active employees', async () => {
      prisma.employee.groupBy.mockResolvedValue([] as any);

      await service.getDepartmentSummary(ORG_ID);

      expect(prisma.employee.groupBy).toHaveBeenCalledWith({
        by: ['department'],
        where: { organizationId: ORG_ID, isActive: true },
        _count: { id: true },
      });
    });
  });
});
