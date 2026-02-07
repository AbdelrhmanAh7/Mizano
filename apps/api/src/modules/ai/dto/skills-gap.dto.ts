import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsNotEmpty } from 'class-validator';

export class SkillGapDto {
  @ApiProperty({ description: 'Skill name' })
  skill: string;

  @ApiProperty({ description: 'Required proficiency level (0-10)' })
  required: number;

  @ApiProperty({ description: 'Current proficiency level (0-10)' })
  current: number;

  @ApiProperty({ description: 'Gap between required and current proficiency' })
  gap: number;
}

export class EmployeeSkillGapDto {
  @ApiProperty({ description: 'Employee ID' })
  employeeId: string;

  @ApiProperty({ description: 'Employee full name' })
  name: string;

  @ApiProperty({ description: 'Department the employee belongs to' })
  department: string;

  @ApiProperty({
    description: 'Current skills with proficiency levels',
    example: { typescript: 8, react: 7, sql: 5 },
  })
  currentSkills: Record<string, number>;

  @ApiProperty({
    description: 'Required skills with target proficiency levels',
    example: { typescript: 9, react: 8, sql: 7 },
  })
  requiredSkills: Record<string, number>;

  @ApiProperty({
    description: 'Identified skill gaps',
    type: [SkillGapDto],
  })
  gaps: SkillGapDto[];

  @ApiProperty({ description: 'Overall match score (0-1)' })
  matchScore: number;

  @ApiProperty({
    description: 'Training and development recommendations',
    type: [String],
  })
  recommendations: string[];
}

export class DepartmentGapDto {
  @ApiProperty({ description: 'Department name' })
  department: string;

  @ApiProperty({ description: 'Number of employees in the department' })
  employeeCount: number;

  @ApiProperty({
    description: 'Most common skill gaps across the department',
    type: [SkillGapDto],
  })
  commonGaps: SkillGapDto[];

  @ApiProperty({ description: 'Overall department readiness score (0-1)' })
  overallReadiness: number;
}

export class SkillInventoryDto {
  @ApiProperty({ description: 'Skill name' })
  skill: string;

  @ApiProperty({ description: 'Number of employees with this skill' })
  count: number;

  @ApiProperty({ description: 'Average proficiency level across employees (0-10)' })
  avgProficiency: number;
}

export class MatchRequiredSkillsDto {
  @ApiProperty({
    description: 'Required skills with minimum proficiency levels',
    example: { typescript: 7, react: 6, nodejs: 5 },
  })
  @IsObject()
  @IsNotEmpty()
  requiredSkills: Record<string, number>;
}

export class EmployeeMatchDto {
  @ApiProperty({ description: 'Employee ID' })
  employeeId: string;

  @ApiProperty({ description: 'Employee full name' })
  name: string;

  @ApiProperty({ description: 'Match score (0-1) based on required skills' })
  matchScore: number;

  @ApiProperty({
    description: 'Skills the employee is missing or underqualified in',
    type: [String],
  })
  missingSkills: string[];
}
