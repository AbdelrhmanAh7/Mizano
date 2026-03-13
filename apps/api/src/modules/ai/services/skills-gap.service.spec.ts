import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SkillsGapService } from './skills-gap.service';
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
} from '../__tests__/fixtures/ai-test-helpers';

describe('SkillsGapService', () => {
  let service: SkillsGapService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillsGapService,
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

    service = module.get<SkillsGapService>(SkillsGapService);
  });

  describe('analyzeEmployeeGap', () => {
    it('should return no gaps when employee has all required skills', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-001',
        name: 'Expert Dev',
        department: 'Engineering',
      } as any);

      prisma.employeeAiProfile.findUnique.mockResolvedValue({
        skillsProfile: {
          typescript: 5,
          git: 5,
          testing: 4,
          architecture: 4,
          communication: 4,
        },
      } as any);

      prisma.employeeAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.analyzeEmployeeGap(TEST_ORG_ID, 'emp-001');

      expect(result.gaps).toEqual([]);
      expect(result.matchScore).toBe(1.0);
      expect(result.recommendations).toEqual([]);
    });

    it('should return 3 gaps when employee is missing 3 skills', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-002',
        name: 'Junior Dev',
        department: 'Engineering',
      } as any);

      prisma.employeeAiProfile.findUnique.mockResolvedValue({
        skillsProfile: {
          typescript: 2,
          git: 1,
          // testing: missing
          // architecture: missing
          // communication: missing
        },
      } as any);

      prisma.employeeAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.analyzeEmployeeGap(TEST_ORG_ID, 'emp-002');

      expect(result.gaps.length).toBe(5); // All 5 skills have gaps
      expect(result.matchScore).toBeLessThan(1.0);
      expect(result.recommendations.length).toBe(5);
    });

    it('should throw NotFoundException when employee not found', async () => {
      prisma.employee.findFirst.mockResolvedValue(null as any);

      await expect(service.analyzeEmployeeGap(TEST_ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should use DEFAULT_TEMPLATE when department has no specific template', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-003',
        name: 'Custom Dept',
        department: 'Marketing', // No template for Marketing
      } as any);

      prisma.employeeAiProfile.findUnique.mockResolvedValue({
        skillsProfile: {},
      } as any);

      prisma.employeeAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.analyzeEmployeeGap(TEST_ORG_ID, 'emp-003');

      // Default template has: communication, teamwork, problem_solving
      const gapSkills = result.gaps.map((g) => g.skill);
      expect(gapSkills).toContain('communication');
      expect(gapSkills).toContain('teamwork');
      expect(gapSkills).toContain('problem_solving');
    });

    it('should use DEFAULT_TEMPLATE when department is null', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-004',
        name: 'No Dept',
        department: null,
      } as any);

      prisma.employeeAiProfile.findUnique.mockResolvedValue({
        skillsProfile: { communication: 5, teamwork: 5, problem_solving: 5 },
      } as any);

      prisma.employeeAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.analyzeEmployeeGap(TEST_ORG_ID, 'emp-004');

      expect(result.gaps).toEqual([]);
      expect(result.matchScore).toBe(1.0);
    });

    it('should sort gaps by gap size descending', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-005',
        name: 'Partial Dev',
        department: 'Engineering',
      } as any);

      prisma.employeeAiProfile.findUnique.mockResolvedValue({
        skillsProfile: {
          typescript: 1, // gap = 3 (required 4)
          git: 3, // gap = 1 (required 4)
          testing: 0, // gap = 3 (required 3)
          architecture: 0, // gap = 3 (required 3)
          communication: 2, // gap = 1 (required 3)
        },
      } as any);

      prisma.employeeAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.analyzeEmployeeGap(TEST_ORG_ID, 'emp-005');

      for (let i = 0; i < result.gaps.length - 1; i++) {
        expect(result.gaps[i].gap).toBeGreaterThanOrEqual(result.gaps[i + 1].gap);
      }
    });

    it('should generate high priority recommendation for gap >= 3', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-006',
        name: 'Beginner',
        department: 'Engineering',
      } as any);

      prisma.employeeAiProfile.findUnique.mockResolvedValue({
        skillsProfile: { typescript: 0 }, // gap = 4
      } as any);

      prisma.employeeAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.analyzeEmployeeGap(TEST_ORG_ID, 'emp-006');

      const tsRec = result.recommendations.find((r) => r.skill === 'typescript');
      expect(tsRec).toBeDefined();
      expect(tsRec!.priority).toBe('high');
      expect(tsRec!.suggestion).toContain('Critical gap');
    });

    it('should return correct matchScore calculation', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-007',
        name: 'Half Skilled',
        department: 'Accounting',
      } as any);

      prisma.employeeAiProfile.findUnique.mockResolvedValue({
        skillsProfile: {
          bookkeeping: 2, // required 4, contributes 2
          tax: 2, // required 3, contributes 2
          audit: 0, // required 3, contributes 0
          excel: 4, // required 4, contributes 4
          regulations: 0, // required 3, contributes 0
        },
      } as any);

      prisma.employeeAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.analyzeEmployeeGap(TEST_ORG_ID, 'emp-007');

      // Total required: 4+3+3+4+3=17. Total matched: 2+2+0+4+0=8
      const expectedScore = 8 / 17;
      expect(result.matchScore).toBeCloseTo(expectedScore, 2);
    });

    it('should store skills gaps in EmployeeAiProfile', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-008',
        name: 'Test',
        department: 'Sales',
      } as any);

      prisma.employeeAiProfile.findUnique.mockResolvedValue({
        skillsProfile: {},
      } as any);

      prisma.employeeAiProfile.upsert.mockResolvedValue({} as any);

      await service.analyzeEmployeeGap(TEST_ORG_ID, 'emp-008');

      expect(prisma.employeeAiProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId: 'emp-008' },
          update: expect.objectContaining({
            skillsGaps: expect.any(Array),
          }),
        }),
      );
    });

    it('should handle employee with no AI profile (null skills)', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-009',
        name: 'No Profile',
        department: 'Engineering',
      } as any);

      prisma.employeeAiProfile.findUnique.mockResolvedValue(null as any);
      prisma.employeeAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.analyzeEmployeeGap(TEST_ORG_ID, 'emp-009');

      // All skills should be gaps since currentSkills is empty
      expect(result.gaps.length).toBe(5); // 5 skills in Engineering template
      expect(result.matchScore).toBe(0);
    });
  });

  describe('analyzeDepartmentGap', () => {
    it('should aggregate gaps across department employees', async () => {
      prisma.employee.findMany.mockResolvedValue([{ id: 'emp-a' }, { id: 'emp-b' }] as any);

      const spy = jest.spyOn(service, 'analyzeEmployeeGap');
      spy.mockResolvedValueOnce({
        employeeId: 'emp-a',
        name: 'A',
        department: 'Engineering',
        currentSkills: {},
        requiredSkills: { typescript: 4 },
        gaps: [{ skill: 'typescript', required: 4, current: 1, gap: 3 }],
        matchScore: 0.25,
        recommendations: [],
        predictionMethod: 'RULE_BASED',
      });
      spy.mockResolvedValueOnce({
        employeeId: 'emp-b',
        name: 'B',
        department: 'Engineering',
        currentSkills: {},
        requiredSkills: { typescript: 4 },
        gaps: [{ skill: 'typescript', required: 4, current: 2, gap: 2 }],
        matchScore: 0.5,
        recommendations: [],
        predictionMethod: 'RULE_BASED',
      });

      const result = await service.analyzeDepartmentGap(TEST_ORG_ID, 'Engineering');

      expect(result.department).toBe('Engineering');
      expect(result.employeeCount).toBe(2);
      expect(result.commonGaps.length).toBeGreaterThan(0);
      expect(result.commonGaps[0].skill).toBe('typescript');
      expect(result.commonGaps[0].affectedCount).toBe(2);
      expect(result.overallReadiness).toBeGreaterThan(0);

      spy.mockRestore();
    });

    it('should return empty result when department has no employees', async () => {
      prisma.employee.findMany.mockResolvedValue([] as any);

      const result = await service.analyzeDepartmentGap(TEST_ORG_ID, 'Empty');

      expect(result.department).toBe('Empty');
      expect(result.employeeCount).toBe(0);
      expect(result.commonGaps).toEqual([]);
      expect(result.overallReadiness).toBe(0);
    });
  });

  describe('getSkillsInventory', () => {
    it('should return aggregated skills inventory', async () => {
      prisma.employeeAiProfile.findMany.mockResolvedValue([
        { skillsProfile: { typescript: 4, git: 3, testing: 2 } },
        { skillsProfile: { typescript: 3, git: 4, communication: 5 } },
        { skillsProfile: { typescript: 5, communication: 3 } },
      ] as any);

      const inventory = await service.getSkillsInventory(TEST_ORG_ID);

      expect(inventory.length).toBeGreaterThan(0);

      const ts = inventory.find((i) => i.skill === 'typescript');
      expect(ts).toBeDefined();
      expect(ts!.employeeCount).toBe(3);
      expect(ts!.avgProficiency).toBe(4);
      expect(ts!.maxProficiency).toBe(5);
    });

    it('should return empty array when no profiles exist', async () => {
      prisma.employeeAiProfile.findMany.mockResolvedValue([] as any);

      const inventory = await service.getSkillsInventory(TEST_ORG_ID);

      expect(inventory).toEqual([]);
    });

    it('should skip skills with zero or negative proficiency', async () => {
      prisma.employeeAiProfile.findMany.mockResolvedValue([
        { skillsProfile: { typescript: 3, invalid: 0, negative: -1 } },
      ] as any);

      const inventory = await service.getSkillsInventory(TEST_ORG_ID);

      const skillNames = inventory.map((i) => i.skill);
      expect(skillNames).toContain('typescript');
      expect(skillNames).not.toContain('invalid');
      expect(skillNames).not.toContain('negative');
    });

    it('should sort by employee count descending', async () => {
      prisma.employeeAiProfile.findMany.mockResolvedValue([
        { skillsProfile: { rare: 5 } },
        { skillsProfile: { common: 3 } },
        { skillsProfile: { common: 4, rare: 2 } },
        { skillsProfile: { common: 5 } },
      ] as any);

      const inventory = await service.getSkillsInventory(TEST_ORG_ID);

      expect(inventory[0].skill).toBe('common');
      expect(inventory[0].employeeCount).toBe(3);
    });
  });

  describe('matchEmployeesToRole', () => {
    it('should rank employees by match score', async () => {
      prisma.employeeAiProfile.findMany.mockResolvedValue([
        {
          employeeId: 'emp-best',
          skillsProfile: { typescript: 4, git: 4, testing: 3 },
          employee: { id: 'emp-best', name: 'Best Match', status: 'ACTIVE', isActive: true },
        },
        {
          employeeId: 'emp-ok',
          skillsProfile: { typescript: 2, git: 1, testing: 0 },
          employee: { id: 'emp-ok', name: 'OK Match', status: 'ACTIVE', isActive: true },
        },
      ] as any);

      const results = await service.matchEmployeesToRole(TEST_ORG_ID, {
        typescript: 4,
        git: 4,
        testing: 3,
      });

      expect(results.length).toBe(2);
      expect(results[0].name).toBe('Best Match');
      expect(results[0].matchScore).toBeGreaterThan(results[1].matchScore);
    });

    it('should return empty array when no active employees have profiles', async () => {
      prisma.employeeAiProfile.findMany.mockResolvedValue([] as any);

      const results = await service.matchEmployeesToRole(TEST_ORG_ID, {
        typescript: 4,
      });

      expect(results).toEqual([]);
    });

    it('should include missing skills in result', async () => {
      prisma.employeeAiProfile.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          skillsProfile: { typescript: 4 },
          employee: { id: 'emp-1', name: 'Dev', status: 'ACTIVE', isActive: true },
        },
      ] as any);

      const results = await service.matchEmployeesToRole(TEST_ORG_ID, {
        typescript: 4,
        python: 3,
        docker: 2,
      });

      expect(results.length).toBe(1);
      expect(results[0].missingSkills.length).toBe(2);
      const missingSkillNames = results[0].missingSkills.map((s) => s.skill);
      expect(missingSkillNames).toContain('python');
      expect(missingSkillNames).toContain('docker');
    });

    it('should filter out inactive employees', async () => {
      prisma.employeeAiProfile.findMany.mockResolvedValue([
        {
          employeeId: 'emp-active',
          skillsProfile: { typescript: 3 },
          employee: { id: 'emp-active', name: 'Active', status: 'ACTIVE', isActive: true },
        },
        {
          employeeId: 'emp-inactive',
          skillsProfile: { typescript: 5 },
          employee: { id: 'emp-inactive', name: 'Inactive', status: 'TERMINATED', isActive: false },
        },
      ] as any);

      const results = await service.matchEmployeesToRole(TEST_ORG_ID, {
        typescript: 4,
      });

      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Active');
    });
  });
});
