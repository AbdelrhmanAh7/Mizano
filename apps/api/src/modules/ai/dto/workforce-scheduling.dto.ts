import { ApiProperty } from '@nestjs/swagger';

export class DailySuggestionDto {
  @ApiProperty({ description: 'Day of the week (e.g., Monday, Tuesday)' })
  dayOfWeek: string;

  @ApiProperty({ description: 'Suggested number of staff for the day' })
  suggestedStaff: number;

  @ApiProperty({ description: 'Historical average staff present on this day' })
  historicalAvg: number;

  @ApiProperty({ description: 'Model confidence in the suggestion (0-1)' })
  confidence: number;
}

export class ScheduleSuggestionDto {
  @ApiProperty({ description: 'Start date of the week (ISO date string)' })
  weekStart: string;

  @ApiProperty({
    description: 'Daily staffing suggestions for each day of the week',
    type: [DailySuggestionDto],
  })
  dailySuggestions: DailySuggestionDto[];

  @ApiProperty({
    description: 'Additional notes and recommendations',
    type: [String],
  })
  notes: string[];
}

export class StaffingNeedDto {
  @ApiProperty({ description: 'Department name' })
  department: string;

  @ApiProperty({ description: 'Current number of staff in the department' })
  currentStaff: number;

  @ApiProperty({ description: 'Recommended number of staff based on analysis' })
  recommendedStaff: number;

  @ApiProperty({ description: 'Gap between current and recommended staffing (positive means understaffed)' })
  gap: number;
}

export class AttendancePatternDto {
  @ApiProperty({ description: 'Day of the week or month label' })
  day: string;

  @ApiProperty({ description: 'Average number of employees present' })
  avgPresent: number;

  @ApiProperty({ description: 'Average number of employees absent' })
  avgAbsent: number;

  @ApiProperty({ description: 'Attendance rate as a percentage (0-100)' })
  attendanceRate: number;
}

export class OvertimeEmployeeDto {
  @ApiProperty({ description: 'Employee ID' })
  employeeId: string;

  @ApiProperty({ description: 'Employee name' })
  name: string;

  @ApiProperty({ description: 'Total overtime hours' })
  overtimeHours: number;
}

export class OvertimeAnalysisDto {
  @ApiProperty({ description: 'Total overtime hours across all employees' })
  totalOvertimeHours: number;

  @ApiProperty({ description: 'Number of employees who worked overtime' })
  employeesAffected: number;

  @ApiProperty({
    description: 'Employees with the most overtime hours',
    type: [OvertimeEmployeeDto],
  })
  topOvertimeEmployees: OvertimeEmployeeDto[];

  @ApiProperty({
    description: 'Recommendations to optimize overtime',
    type: [String],
  })
  recommendations: string[];
}
