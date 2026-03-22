import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EmployeeAttritionService } from './employee-attrition.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeedbackService } from './ai-feedback.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  createMockPrisma,
  createMockAiFeedback,
  createMockEventEmitter,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('EmployeeAttritionService', () => {
  let service: EmployeeAttritionService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeAttritionService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiFeedbackService, useValue: createMockAiFeedback() },
        { provide: EventEmitter2, useValue: createMockEventEmitter() },
        {
          provide: OllamaInferenceGateway,
          useValue: {
            infer: jest.fn().mockResolvedValue(null),
            isHealthy: jest.fn().mockResolvedValue(false),
            isAvailable: jest.fn().mockResolvedValue(false),
          },
        },
      ],
    }).compile();

    service = module.get<EmployeeAttritionService>(EmployeeAttritionService);
  });

  describe('predictAttrition', () => {
    const mockEmployee = {
      id: 'emp-001',
      name: 'John Doe',
      hireDate: new Date('2020-01-15'),
      dateOfJoining: new Date('2020-01-15'),
      basicSalary: mockDecimal(5000),
      department: 'Engineering',
      status: 'ACTIVE',
      isActive: true,
      organizationId: TEST_ORG_ID,
    };

    beforeEach(() => {
      // First call in predictAttrition for employee lookup
      prisma.employee.findFirst
        .mockResolvedValueOnce(mockEmployee as any)
        // Second call in extractAttritionFeatures
        .mockResolvedValueOnce(mockEmployee as any);

      // Department employees for salary ratio
      prisma.employee.findMany.mockResolvedValue([
        { basicSalary: mockDecimal(4000) },
        { basicSalary: mockDecimal(5000) },
        { basicSalary: mockDecimal(6000) },
      ] as any);

      // Attendance records
      prisma.attendance.findMany.mockResolvedValue([
        { status: 'PRESENT' },
        { status: 'PRESENT' },
        { status: 'PRESENT' },
        { status: 'PRESENT' },
        { status: 'ABSENT' },
      ] as any);

      // Department turnover counts
      prisma.employee.count
        .mockResolvedValueOnce(20 as any) // total in dept
        .mockResolvedValueOnce(2 as any); // terminated in dept

      // Upsert profile
      prisma.employeeAiProfile.upsert.mockResolvedValue({} as any);
    });

    it('should return LOW risk for long-tenure employee with good attendance', async () => {
      const result = await service.predictAttrition(TEST_ORG_ID, 'emp-001');

      expect(result.employeeId).toBe('emp-001');
      expect(result.employeeName).toBe('John Doe');
      expect(result.riskLevel).toBe('LOW');
      expect(result.attritionRisk).toBeLessThan(0.5);
      expect(result.predictionMethod).toBe('RULE_BASED');
      expect(result.confidence).toBe(0.7); // No ML model → 0.7
    });

    it('should return HIGH risk for short-tenure employee with high absence', async () => {
      const newHire = {
        ...mockEmployee,
        name: 'New Hire',
        hireDate: new Date(Date.now() - 90 * 86400000), // 3 months
        basicSalary: mockDecimal(2000), // significantly underpaid
      };

      prisma.employee.findFirst
        .mockReset()
        .mockResolvedValueOnce(newHire as any)
        .mockResolvedValueOnce(newHire as any);

      // Low salary ratio employees
      prisma.employee.findMany.mockResolvedValue([
        { basicSalary: mockDecimal(4000) },
        { basicSalary: mockDecimal(5000) },
        { basicSalary: mockDecimal(6000) },
      ] as any);

      // High absences
      prisma.attendance.findMany.mockResolvedValue([
        { status: 'ABSENT' },
        { status: 'ABSENT' },
        { status: 'ABSENT' },
        { status: 'LEAVE' },
        { status: 'PRESENT' },
      ] as any);

      // High department turnover
      prisma.employee.count
        .mockReset()
        .mockResolvedValueOnce(10 as any)
        .mockResolvedValueOnce(5 as any);

      const result = await service.predictAttrition(TEST_ORG_ID, 'emp-001');

      expect(result.riskLevel).toMatch(/HIGH|CRITICAL/);
      expect(result.attritionRisk).toBeGreaterThan(0.5);
      expect(result.factors.length).toBeGreaterThan(0);
    });

    it('should throw NotFoundException when employee does not exist', async () => {
      prisma.employee.findFirst.mockReset().mockResolvedValue(null as any);

      await expect(service.predictAttrition(TEST_ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should include factor descriptions in result', async () => {
      const result = await service.predictAttrition(TEST_ORG_ID, 'emp-001');

      for (const factor of result.factors) {
        expect(factor.factor).toBeDefined();
        expect(typeof factor.impact).toBe('number');
        expect(factor.description).toBeDefined();
        expect(factor.description.length).toBeGreaterThan(0);
      }
    });

    it('should include a recommendation in result', async () => {
      const result = await service.predictAttrition(TEST_ORG_ID, 'emp-001');

      expect(result.recommendation).toBeDefined();
      expect(result.recommendation.length).toBeGreaterThan(0);
    });

    it('should store prediction in EmployeeAiProfile', async () => {
      await service.predictAttrition(TEST_ORG_ID, 'emp-001');

      expect(prisma.employeeAiProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId: 'emp-001' },
          create: expect.objectContaining({ employeeId: 'emp-001' }),
          update: expect.objectContaining({
            attritionRisk: expect.anything(),
          }),
        }),
      );
    });
  });

  describe('getFlightRisk', () => {
    it('should return employees with attritionRisk >= 0.5 sorted descending', async () => {
      prisma.employeeAiProfile.findMany.mockResolvedValue([
        {
          employeeId: 'emp-high',
          attritionRisk: mockDecimal(0.85),
          attritionFactors: [{ factor: 'underpaid', impact: 0.3, description: 'Below median' }],
          employee: { id: 'emp-high', name: 'High Risk', department: 'Sales', jobTitle: 'Rep' },
        },
        {
          employeeId: 'emp-med',
          attritionRisk: mockDecimal(0.55),
          attritionFactors: [],
          employee: { id: 'emp-med', name: 'Med Risk', department: 'IT', jobTitle: 'Dev' },
        },
      ] as any);

      const result = await service.getFlightRisk(TEST_ORG_ID);

      expect(result).toHaveLength(2);
      expect(result[0].attritionRisk).toBeGreaterThan(result[1].attritionRisk);
      expect(result[0].employeeName).toBe('High Risk');
      expect(result[0].department).toBe('Sales');
    });

    it('should return empty array when no flight risks', async () => {
      prisma.employeeAiProfile.findMany.mockResolvedValue([] as any);

      const result = await service.getFlightRisk(TEST_ORG_ID);

      expect(result).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      prisma.employeeAiProfile.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          attritionRisk: mockDecimal(0.9),
          attritionFactors: [],
          employee: { id: 'emp-1', name: 'A', department: null, jobTitle: null },
        },
      ] as any);

      await service.getFlightRisk(TEST_ORG_ID, 5);

      expect(prisma.employeeAiProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });

  describe('predictAll', () => {
    it('should process all active employees and return counts', async () => {
      prisma.employee.findMany.mockResolvedValue([
        { id: 'emp-1' },
        { id: 'emp-2' },
        { id: 'emp-3' },
      ] as any);

      // Mock predictAttrition calls for each employee
      const spy = jest.spyOn(service, 'predictAttrition');
      spy.mockResolvedValueOnce({ riskLevel: 'HIGH' } as any);
      spy.mockResolvedValueOnce({ riskLevel: 'MEDIUM' } as any);
      spy.mockResolvedValueOnce({ riskLevel: 'LOW' } as any);

      const result = await service.predictAll(TEST_ORG_ID);

      expect(result.processed).toBe(3);
      expect(result.highRisk).toBe(1);
      expect(result.mediumRisk).toBe(1);
      expect(result.lowRisk).toBe(1);

      spy.mockRestore();
    });

    it('should handle errors for individual employees gracefully', async () => {
      prisma.employee.findMany.mockResolvedValue([{ id: 'emp-1' }, { id: 'emp-bad' }] as any);

      const spy = jest.spyOn(service, 'predictAttrition');
      spy.mockResolvedValueOnce({ riskLevel: 'LOW' } as any);
      spy.mockRejectedValueOnce(new Error('Employee not found'));

      const result = await service.predictAll(TEST_ORG_ID);

      expect(result.processed).toBe(2);
      expect(result.lowRisk).toBe(1);

      spy.mockRestore();
    });

    it('should return zeros when no active employees', async () => {
      prisma.employee.findMany.mockResolvedValue([] as any);

      const result = await service.predictAll(TEST_ORG_ID);

      expect(result.processed).toBe(0);
      expect(result.highRisk).toBe(0);
      expect(result.mediumRisk).toBe(0);
      expect(result.lowRisk).toBe(0);
    });
  });
});
