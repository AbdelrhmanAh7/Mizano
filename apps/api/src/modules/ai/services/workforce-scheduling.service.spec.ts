import { Test, TestingModule } from '@nestjs/testing';
import { WorkforceSchedulingService } from './workforce-scheduling.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
} from '../__tests__/fixtures/ai-test-helpers';

describe('WorkforceSchedulingService', () => {
  let service: WorkforceSchedulingService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkforceSchedulingService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: OllamaInferenceGateway,
          useValue: {
            generateCompletion: jest.fn().mockResolvedValue(''),
            generateStructuredOutput: jest.fn().mockResolvedValue({}),
            isAvailable: jest.fn().mockResolvedValue(false),
          },
        },
      ],
    }).compile();

    service = module.get<WorkforceSchedulingService>(WorkforceSchedulingService);
  });

  describe('suggestSchedule', () => {
    it('should return a schedule covering 7 days', async () => {
      prisma.attendance.findMany.mockResolvedValue([] as any);
      prisma.employee.count.mockResolvedValue(10 as any);

      const result = await service.suggestSchedule(TEST_ORG_ID);

      expect(result.dailySuggestions).toHaveLength(7);
      expect(result.dailySuggestions[0].dayOfWeek).toBe(0);
      expect(result.dailySuggestions[6].dayOfWeek).toBe(6);
    });

    it('should suggest more staff on high-attendance days', async () => {
      // Create attendance data where Monday (day 1) has higher attendance
      const records: Record<string, unknown>[] = [];

      // Generate 12 Mondays with 20 present each
      for (let w = 0; w < 12; w++) {
        const monday = new Date(2024, 0, 1 + w * 7); // Mondays in Jan 2024
        monday.setDate(monday.getDate() + ((1 - monday.getDay() + 7) % 7));
        for (let e = 0; e < 20; e++) {
          records.push({
            date: new Date(monday),
            status: 'PRESENT',
            employeeId: `emp-${e}`,
          });
        }
      }

      // Generate 12 Fridays with only 5 present each
      for (let w = 0; w < 12; w++) {
        const friday = new Date(2024, 0, 5 + w * 7);
        for (let e = 0; e < 5; e++) {
          records.push({
            date: new Date(friday),
            status: 'PRESENT',
            employeeId: `emp-${e}`,
          });
        }
        for (let e = 5; e < 15; e++) {
          records.push({
            date: new Date(friday),
            status: 'ABSENT',
            employeeId: `emp-${e}`,
          });
        }
      }

      prisma.attendance.findMany.mockResolvedValue(records as any);
      prisma.employee.count.mockResolvedValue(20 as any);

      const result = await service.suggestSchedule(TEST_ORG_ID);

      const monday = result.dailySuggestions.find((d) => d.dayOfWeek === 1);
      const friday = result.dailySuggestions.find((d) => d.dayOfWeek === 5);

      expect(monday).toBeDefined();
      expect(friday).toBeDefined();

      if (monday && friday) {
        expect(monday.historicalAvgPresent).toBeGreaterThan(friday.historicalAvgPresent);
        expect(monday.suggestedStaff).toBeGreaterThan(friday.suggestedStaff);
      }
    });

    it('should accept a custom weekStartDate', async () => {
      prisma.attendance.findMany.mockResolvedValue([] as any);
      prisma.employee.count.mockResolvedValue(5 as any);

      const result = await service.suggestSchedule(TEST_ORG_ID, '2024-03-04');

      expect(result.weekStart).toBe('2024-03-04');
    });

    it('should include notes about active employees', async () => {
      prisma.attendance.findMany.mockResolvedValue([] as any);
      prisma.employee.count.mockResolvedValue(25 as any);

      const result = await service.suggestSchedule(TEST_ORG_ID);

      const activeNote = result.notes.find((n) => n.includes('Total active employees'));
      expect(activeNote).toBeDefined();
      expect(activeNote).toContain('25');
    });

    it('should have low confidence when no historical data exists', async () => {
      prisma.attendance.findMany.mockResolvedValue([] as any);
      prisma.employee.count.mockResolvedValue(10 as any);

      const result = await service.suggestSchedule(TEST_ORG_ID);

      for (const day of result.dailySuggestions) {
        expect(day.confidence).toBeLessThanOrEqual(0.3);
      }
    });

    it('should include day names in suggestions', async () => {
      prisma.attendance.findMany.mockResolvedValue([] as any);
      prisma.employee.count.mockResolvedValue(1 as any);

      const result = await service.suggestSchedule(TEST_ORG_ID);

      const dayNames = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      for (let i = 0; i < 7; i++) {
        expect(result.dailySuggestions[i].dayName).toBe(dayNames[i]);
      }
    });
  });

  describe('getStaffingNeeds', () => {
    it('should return staffing needs per department', async () => {
      prisma.employee.findMany.mockResolvedValue([
        { id: 'e1', department: 'Engineering' },
        { id: 'e2', department: 'Engineering' },
        { id: 'e3', department: 'Sales' },
      ] as any);

      prisma.attendance.findMany.mockResolvedValue([
        { employeeId: 'e1', status: 'PRESENT', date: new Date() },
        { employeeId: 'e2', status: 'ABSENT', date: new Date() },
        { employeeId: 'e3', status: 'PRESENT', date: new Date() },
      ] as any);

      const result = await service.getStaffingNeeds(TEST_ORG_ID);

      expect(result.departments.length).toBe(2);
      expect(result.totalCurrent).toBe(3);
      expect(result.totalRecommended).toBeGreaterThanOrEqual(3);
    });

    it('should recommend more staff for departments with low attendance', async () => {
      prisma.employee.findMany.mockResolvedValue([
        { id: 'e1', department: 'Struggling' },
        { id: 'e2', department: 'Struggling' },
        { id: 'e3', department: 'Struggling' },
        { id: 'e4', department: 'Struggling' },
        { id: 'e5', department: 'Struggling' },
      ] as any);

      // 50% attendance → needs more staff
      const records: Record<string, unknown>[] = [];
      for (let i = 0; i < 20; i++) {
        records.push({
          employeeId: `e${(i % 5) + 1}`,
          status: i % 2 === 0 ? 'PRESENT' : 'ABSENT',
          date: new Date(Date.now() - i * 86400000),
        });
      }

      prisma.attendance.findMany.mockResolvedValue(records as any);

      const result = await service.getStaffingNeeds(TEST_ORG_ID);

      const dept = result.departments.find((d) => d.name === 'Struggling');
      expect(dept).toBeDefined();
      expect(dept!.recommendedStaff).toBeGreaterThan(dept!.currentStaff);
      expect(dept!.gap).toBeGreaterThan(0);
    });

    it('should return empty departments when no employees', async () => {
      prisma.employee.findMany.mockResolvedValue([] as any);
      prisma.attendance.findMany.mockResolvedValue([] as any);

      const result = await service.getStaffingNeeds(TEST_ORG_ID);

      expect(result.departments).toEqual([]);
      expect(result.totalCurrent).toBe(0);
    });
  });

  describe('getAttendancePatterns', () => {
    it('should return patterns by day of week', async () => {
      const records = [
        { date: new Date(2024, 0, 1), status: 'PRESENT' }, // Monday
        { date: new Date(2024, 0, 2), status: 'PRESENT' }, // Tuesday
        { date: new Date(2024, 0, 3), status: 'ABSENT' }, // Wednesday
      ];

      prisma.attendance.findMany.mockResolvedValue(records as any);

      const result = await service.getAttendancePatterns(TEST_ORG_ID);

      expect(result.byDayOfWeek).toHaveLength(7);
      expect(result.byDayOfWeek[0].dayName).toBe('Sunday');
      expect(result.byDayOfWeek[1].dayName).toBe('Monday');
    });

    it('should return patterns by month', async () => {
      const records = [
        { date: new Date(2024, 0, 15), status: 'PRESENT' },
        { date: new Date(2024, 1, 15), status: 'ABSENT' },
      ];

      prisma.attendance.findMany.mockResolvedValue(records as any);

      const result = await service.getAttendancePatterns(TEST_ORG_ID);

      expect(result.byMonth.length).toBeGreaterThan(0);
      const jan = result.byMonth.find((m) => m.monthName === 'January');
      expect(jan).toBeDefined();
    });

    it('should return empty patterns when no attendance data', async () => {
      prisma.attendance.findMany.mockResolvedValue([] as any);

      const result = await service.getAttendancePatterns(TEST_ORG_ID);

      expect(result.byDayOfWeek).toHaveLength(7);
      expect(result.byMonth).toHaveLength(0); // Months with 0 total are skipped
    });
  });

  describe('getOvertimeAnalysis', () => {
    it('should calculate overtime hours for employees exceeding 9h', async () => {
      const baseDate = new Date(2024, 5, 10, 8, 0, 0);
      const checkIn = new Date(baseDate);
      const checkOut = new Date(baseDate);
      checkOut.setHours(19); // 11 hours → 2 hours overtime

      prisma.attendance.findMany.mockResolvedValue([
        {
          employeeId: 'emp-ot',
          checkIn,
          checkOut,
        },
      ] as any);

      prisma.employee.findMany.mockResolvedValue([
        { id: 'emp-ot', name: 'Overtime Worker', department: 'Engineering' },
      ] as any);

      const result = await service.getOvertimeAnalysis(TEST_ORG_ID);

      expect(result.totalOvertimeHours).toBeCloseTo(2, 0);
      expect(result.employeesAffected).toBe(1);
      expect(result.topOvertimeEmployees).toHaveLength(1);
      expect(result.topOvertimeEmployees[0].employeeName).toBe('Overtime Worker');
    });

    it('should return zero overtime when no one exceeds standard hours', async () => {
      const checkIn = new Date(2024, 5, 10, 9, 0, 0);
      const checkOut = new Date(2024, 5, 10, 17, 0, 0); // 8 hours

      prisma.attendance.findMany.mockResolvedValue([
        { employeeId: 'emp-1', checkIn, checkOut },
      ] as any);

      prisma.employee.findMany.mockResolvedValue([] as any);

      const result = await service.getOvertimeAnalysis(TEST_ORG_ID);

      expect(result.totalOvertimeHours).toBe(0);
      expect(result.employeesAffected).toBe(0);
    });

    it('should include recommendations when overtime is excessive', async () => {
      const checkIn = new Date(2024, 5, 10, 7, 0, 0);
      const checkOut = new Date(2024, 5, 10, 20, 0, 0); // 13 hours → 4 hours OT

      // 25 days of overtime for one employee
      const records = Array.from({ length: 25 }, () => ({
        employeeId: 'emp-burnout',
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
      }));

      prisma.attendance.findMany.mockResolvedValue(records as any);
      prisma.employee.findMany.mockResolvedValue([
        { id: 'emp-burnout', name: 'Burned Out', department: 'Ops' },
      ] as any);

      const result = await service.getOvertimeAnalysis(TEST_ORG_ID);

      expect(result.totalOvertimeHours).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
      const burnoutWarning = result.recommendations.find((r) => r.includes('burnout'));
      expect(burnoutWarning).toBeDefined();
    });

    it('should return default recommendation when no excessive overtime', async () => {
      prisma.attendance.findMany.mockResolvedValue([] as any);
      prisma.employee.findMany.mockResolvedValue([] as any);

      const result = await service.getOvertimeAnalysis(TEST_ORG_ID);

      expect(result.recommendations).toContain('Overtime levels are within normal range');
    });
  });
});
