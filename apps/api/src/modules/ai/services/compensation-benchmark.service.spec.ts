import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CompensationBenchmarkService } from './compensation-benchmark.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ModelRegistryService } from './model-registry.service';
import { AiFeedbackService } from './ai-feedback.service';
import { AiTrainingService } from './ai-training.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  createMockPrisma,
  createMockModelRegistry,
  createMockAiFeedback,
  createMockAiTraining,
  createMockEventEmitter,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('CompensationBenchmarkService', () => {
  let service: CompensationBenchmarkService;
  let prisma: MockPrismaClient;
  let modelRegistry: ReturnType<typeof createMockModelRegistry>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    modelRegistry = createMockModelRegistry();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompensationBenchmarkService,
        { provide: PrismaService, useValue: prisma },
        { provide: ModelRegistryService, useValue: modelRegistry },
        { provide: AiFeedbackService, useValue: createMockAiFeedback() },
        { provide: AiTrainingService, useValue: createMockAiTraining() },
        { provide: EventEmitter2, useValue: createMockEventEmitter() },
      ],
    }).compile();

    service = module.get<CompensationBenchmarkService>(CompensationBenchmarkService);
  });

  describe('benchmarkEmployee', () => {
    it('should return fair status for salary at median (compensationIndex ~1.0)', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-001',
        name: 'Jane Smith',
        department: 'Engineering',
        jobTitle: 'Developer',
        basicSalary: mockDecimal(5000),
      } as any);

      // Department stats: median = 5000
      prisma.employee.findMany.mockResolvedValue([
        { basicSalary: mockDecimal(4000) },
        { basicSalary: mockDecimal(5000) },
        { basicSalary: mockDecimal(6000) },
      ] as any);

      prisma.employeeAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.benchmarkEmployee(TEST_ORG_ID, 'emp-001');

      expect(result.status).toBe('fair');
      expect(result.compensationIndex).toBeGreaterThanOrEqual(0.85);
      expect(result.compensationIndex).toBeLessThanOrEqual(1.15);
      expect(result.name).toBe('Jane Smith');
      expect(result.department).toBe('Engineering');
    });

    it('should return underpaid status when salary is far below median', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-002',
        name: 'Underpaid Employee',
        department: 'Engineering',
        jobTitle: 'Junior',
        basicSalary: mockDecimal(2000),
      } as any);

      // Department median ~5000
      prisma.employee.findMany.mockResolvedValue([
        { basicSalary: mockDecimal(4500) },
        { basicSalary: mockDecimal(5000) },
        { basicSalary: mockDecimal(5500) },
        { basicSalary: mockDecimal(6000) },
      ] as any);

      prisma.employeeAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.benchmarkEmployee(TEST_ORG_ID, 'emp-002');

      expect(result.status).toBe('underpaid');
      expect(result.compensationIndex).toBeLessThan(0.85);
      expect(result.recommendation).toContain('salary');
    });

    it('should return overpaid status when salary is far above median', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-003',
        name: 'Overpaid Employee',
        department: 'Engineering',
        jobTitle: 'Senior',
        basicSalary: mockDecimal(10000),
      } as any);

      // Department median ~5000
      prisma.employee.findMany.mockResolvedValue([
        { basicSalary: mockDecimal(4500) },
        { basicSalary: mockDecimal(5000) },
        { basicSalary: mockDecimal(5500) },
      ] as any);

      prisma.employeeAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.benchmarkEmployee(TEST_ORG_ID, 'emp-003');

      expect(result.status).toBe('overpaid');
      expect(result.compensationIndex).toBeGreaterThan(1.15);
    });

    it('should throw NotFoundException when employee not found', async () => {
      prisma.employee.findFirst.mockResolvedValue(null as any);

      await expect(service.benchmarkEmployee(TEST_ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle employee with null department gracefully', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-004',
        name: 'No Dept',
        department: null,
        jobTitle: null,
        basicSalary: mockDecimal(3000),
      } as any);

      // No department means getDepartmentStats returns zeros
      prisma.employee.findMany.mockResolvedValue([] as any);
      prisma.employeeAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.benchmarkEmployee(TEST_ORG_ID, 'emp-004');

      expect(result.department).toBeNull();
      // When department median is 0, compensationIndex defaults to 1.0
      expect(result.compensationIndex).toBe(1.0);
      expect(result.status).toBe('fair');
    });

    it('should store compensationIndex in EmployeeAiProfile', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-005',
        name: 'Test',
        department: 'HR',
        jobTitle: 'Manager',
        basicSalary: mockDecimal(5000),
      } as any);

      prisma.employee.findMany.mockResolvedValue([{ basicSalary: mockDecimal(5000) }] as any);

      prisma.employeeAiProfile.upsert.mockResolvedValue({} as any);

      await service.benchmarkEmployee(TEST_ORG_ID, 'emp-005');

      expect(prisma.employeeAiProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId: 'emp-005' },
        }),
      );
    });
  });

  describe('getDepartmentBenchmarks', () => {
    it('should return benchmarks grouped by department', async () => {
      prisma.employee.findMany.mockResolvedValue([
        {
          id: 'e1',
          name: 'A',
          department: 'Engineering',
          jobTitle: 'Dev',
          basicSalary: mockDecimal(5000),
        },
        {
          id: 'e2',
          name: 'B',
          department: 'Engineering',
          jobTitle: 'Dev',
          basicSalary: mockDecimal(6000),
        },
        {
          id: 'e3',
          name: 'C',
          department: 'Sales',
          jobTitle: 'Rep',
          basicSalary: mockDecimal(3000),
        },
      ] as any);

      const result = await service.getDepartmentBenchmarks(TEST_ORG_ID);

      expect(result).toHaveLength(2);
      const engineering = result.find((d) => d.department === 'Engineering');
      expect(engineering).toBeDefined();
      expect(engineering!.count).toBe(2);
      expect(engineering!.median).toBeGreaterThan(0);
    });

    it('should return empty array when no employees exist', async () => {
      prisma.employee.findMany.mockResolvedValue([] as any);

      const result = await service.getDepartmentBenchmarks(TEST_ORG_ID);

      expect(result).toEqual([]);
    });

    it('should calculate outlier count using IQR method', async () => {
      prisma.employee.findMany.mockResolvedValue([
        { id: 'e1', name: 'A', department: 'Dept', jobTitle: null, basicSalary: mockDecimal(1000) },
        { id: 'e2', name: 'B', department: 'Dept', jobTitle: null, basicSalary: mockDecimal(1050) },
        { id: 'e3', name: 'C', department: 'Dept', jobTitle: null, basicSalary: mockDecimal(1100) },
        { id: 'e4', name: 'D', department: 'Dept', jobTitle: null, basicSalary: mockDecimal(1150) },
        {
          id: 'e5',
          name: 'Outlier',
          department: 'Dept',
          jobTitle: null,
          basicSalary: mockDecimal(5000),
        },
      ] as any);

      const result = await service.getDepartmentBenchmarks(TEST_ORG_ID);

      const dept = result[0];
      expect(dept.outlierCount).toBeGreaterThanOrEqual(1);
    });

    it('should sort departments by employee count descending', async () => {
      prisma.employee.findMany.mockResolvedValue([
        {
          id: 'e1',
          name: 'A',
          department: 'Small',
          jobTitle: null,
          basicSalary: mockDecimal(1000),
        },
        {
          id: 'e2',
          name: 'B',
          department: 'Large',
          jobTitle: null,
          basicSalary: mockDecimal(2000),
        },
        {
          id: 'e3',
          name: 'C',
          department: 'Large',
          jobTitle: null,
          basicSalary: mockDecimal(3000),
        },
        {
          id: 'e4',
          name: 'D',
          department: 'Large',
          jobTitle: null,
          basicSalary: mockDecimal(4000),
        },
      ] as any);

      const result = await service.getDepartmentBenchmarks(TEST_ORG_ID);

      expect(result[0].department).toBe('Large');
      expect(result[0].count).toBe(3);
    });
  });

  describe('getOutliers', () => {
    it('should flag salary far above mean as outlier', async () => {
      prisma.employee.findMany.mockResolvedValue([
        {
          id: 'e1',
          name: 'Normal1',
          department: 'IT',
          jobTitle: 'Dev',
          basicSalary: mockDecimal(5000),
        },
        {
          id: 'e2',
          name: 'Normal2',
          department: 'IT',
          jobTitle: 'Dev',
          basicSalary: mockDecimal(5100),
        },
        {
          id: 'e3',
          name: 'Normal3',
          department: 'IT',
          jobTitle: 'Dev',
          basicSalary: mockDecimal(4900),
        },
        {
          id: 'e4',
          name: 'Normal4',
          department: 'IT',
          jobTitle: 'Dev',
          basicSalary: mockDecimal(5050),
        },
        {
          id: 'e5',
          name: 'Outlier',
          department: 'IT',
          jobTitle: 'CTO',
          basicSalary: mockDecimal(20000),
        },
      ] as any);

      const outliers = await service.getOutliers(TEST_ORG_ID);

      expect(outliers.length).toBeGreaterThan(0);
      const cto = outliers.find((o) => o.name === 'Outlier');
      expect(cto).toBeDefined();
      expect(cto!.deviation).toBe('above');
      expect(cto!.deviationAmount).toBeGreaterThan(0);
    });

    it('should skip departments with fewer than 3 employees', async () => {
      prisma.employee.findMany.mockResolvedValue([
        {
          id: 'e1',
          name: 'Solo',
          department: 'Tiny',
          jobTitle: null,
          basicSalary: mockDecimal(100000),
        },
        {
          id: 'e2',
          name: 'Duo',
          department: 'Tiny',
          jobTitle: null,
          basicSalary: mockDecimal(1000),
        },
      ] as any);

      const outliers = await service.getOutliers(TEST_ORG_ID);

      expect(outliers).toEqual([]);
    });

    it('should return empty array when no outliers exist', async () => {
      prisma.employee.findMany.mockResolvedValue([
        { id: 'e1', name: 'A', department: 'IT', jobTitle: null, basicSalary: mockDecimal(5000) },
        { id: 'e2', name: 'B', department: 'IT', jobTitle: null, basicSalary: mockDecimal(5000) },
        { id: 'e3', name: 'C', department: 'IT', jobTitle: null, basicSalary: mockDecimal(5000) },
      ] as any);

      const outliers = await service.getOutliers(TEST_ORG_ID);

      expect(outliers).toEqual([]);
    });
  });

  describe('getSalaryDistribution', () => {
    it('should return salary distribution with buckets', async () => {
      prisma.employee.findMany.mockResolvedValue([
        { id: 'e1', name: 'A', department: 'IT', jobTitle: null, basicSalary: mockDecimal(3000) },
        { id: 'e2', name: 'B', department: 'IT', jobTitle: null, basicSalary: mockDecimal(5000) },
        { id: 'e3', name: 'C', department: 'IT', jobTitle: null, basicSalary: mockDecimal(7000) },
        { id: 'e4', name: 'D', department: 'IT', jobTitle: null, basicSalary: mockDecimal(4000) },
      ] as any);

      const result = await service.getSalaryDistribution(TEST_ORG_ID);

      expect(result.totalEmployees).toBe(4);
      expect(result.overallMedian).toBeGreaterThan(0);
      expect(result.overallMean).toBeGreaterThan(0);
      expect(result.buckets.length).toBeGreaterThan(0);
      // Each bucket has required fields
      for (const bucket of result.buckets) {
        expect(bucket.range).toBeDefined();
        expect(bucket.count).toBeGreaterThanOrEqual(0);
        expect(bucket.percentage).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return empty distribution when no employees exist', async () => {
      prisma.employee.findMany.mockResolvedValue([] as any);

      const result = await service.getSalaryDistribution(TEST_ORG_ID);

      expect(result.totalEmployees).toBe(0);
      expect(result.overallMedian).toBe(0);
      expect(result.overallMean).toBe(0);
      expect(result.buckets).toEqual([]);
    });

    it('should use appropriate bucket size based on salary range', async () => {
      // Range 0-50000 → bucket size 5000
      prisma.employee.findMany.mockResolvedValue([
        { id: 'e1', name: 'A', department: 'IT', jobTitle: null, basicSalary: mockDecimal(10000) },
        { id: 'e2', name: 'B', department: 'IT', jobTitle: null, basicSalary: mockDecimal(40000) },
      ] as any);

      const result = await service.getSalaryDistribution(TEST_ORG_ID);

      expect(result.buckets.length).toBeGreaterThan(1);
      const bucketSize = result.buckets[0].max - result.buckets[0].min;
      expect(bucketSize).toBe(5000); // range is 30000, which falls in 20001-50000
    });

    it('should correctly compute median for even number of employees', async () => {
      prisma.employee.findMany.mockResolvedValue([
        { id: 'e1', name: 'A', department: 'IT', jobTitle: null, basicSalary: mockDecimal(2000) },
        { id: 'e2', name: 'B', department: 'IT', jobTitle: null, basicSalary: mockDecimal(4000) },
      ] as any);

      const result = await service.getSalaryDistribution(TEST_ORG_ID);

      expect(result.overallMedian).toBe(3000);
    });
  });
});
