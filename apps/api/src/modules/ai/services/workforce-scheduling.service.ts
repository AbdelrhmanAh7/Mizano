import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { buildSchedulingPrompt } from '../prompts/hr.prompts';
import { PredictionMethod } from '../types/prediction-method.type';
import { describeError } from '../../../common/utils/redact';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ss = require('simple-statistics');

export interface DailySuggestion {
  dayOfWeek: number;
  dayName: string;
  suggestedStaff: number;
  historicalAvgPresent: number;
  historicalAvgAbsent: number;
  confidence: number;
}

export interface ScheduleSuggestion {
  weekStart: string;
  dailySuggestions: DailySuggestion[];
  notes: string[];
  predictionMethod: PredictionMethod;
}

export interface DepartmentStaffingNeed {
  name: string;
  currentStaff: number;
  recommendedStaff: number;
  gap: number;
}

export interface StaffingNeeds {
  departments: DepartmentStaffingNeed[];
  totalCurrent: number;
  totalRecommended: number;
}

export interface DayOfWeekPattern {
  day: number;
  dayName: string;
  avgPresent: number;
  avgAbsent: number;
  attendanceRate: number;
}

export interface MonthlyPattern {
  month: number;
  monthName: string;
  avgPresent: number;
  avgAbsent: number;
  attendanceRate: number;
}

export interface AttendancePatterns {
  byDayOfWeek: DayOfWeekPattern[];
  byMonth: MonthlyPattern[];
}

export interface OvertimeEmployee {
  employeeId: string;
  employeeName: string;
  department: string | null;
  totalOvertimeHours: number;
  overtimeDays: number;
}

export interface OvertimeAnalysis {
  totalOvertimeHours: number;
  employeesAffected: number;
  topOvertimeEmployees: OvertimeEmployee[];
  recommendations: string[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const STANDARD_WORK_HOURS = 9;

@Injectable()
export class WorkforceSchedulingService {
  private readonly logger = new Logger(WorkforceSchedulingService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: OllamaInferenceGateway,
  ) {}

  /**
   * Suggest optimal schedule for the next week based on attendance patterns
   */
  async suggestSchedule(
    organizationId: string,
    weekStartDate?: string,
  ): Promise<ScheduleSuggestion> {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const attendance = await this.prisma.attendance.findMany({
      where: {
        organizationId,
        date: { gte: threeMonthsAgo },
      },
      select: {
        date: true,
        status: true,
        employeeId: true,
      },
    });

    // Count total active employees
    const activeEmployees = await this.prisma.employee.count({
      where: { organizationId, isActive: true },
    });

    // Group attendance by day of week
    const dayOfWeekData = new Map<number, { present: number[]; total: number[] }>();
    for (let d = 0; d < 7; d++) {
      dayOfWeekData.set(d, { present: [], total: [] });
    }

    // Group by date first to count per-day totals
    const dateGroups = new Map<string, { present: number; total: number; dayOfWeek: number }>();
    for (const record of attendance) {
      const dateKey = record.date.toISOString().split('T')[0];
      if (!dateGroups.has(dateKey)) {
        dateGroups.set(dateKey, {
          present: 0,
          total: 0,
          dayOfWeek: record.date.getDay(),
        });
      }
      const group = dateGroups.get(dateKey)!;
      group.total++;
      if (record.status === 'PRESENT' || record.status === 'HALF_DAY') {
        group.present++;
      }
    }

    for (const [, group] of dateGroups) {
      const dayData = dayOfWeekData.get(group.dayOfWeek)!;
      dayData.present.push(group.present);
      dayData.total.push(group.total);
    }

    // Calculate start of next week
    const now = new Date();
    let weekStart: Date;
    if (weekStartDate) {
      weekStart = new Date(weekStartDate);
    } else {
      weekStart = new Date(now);
      const daysUntilNextSunday = (7 - weekStart.getDay()) % 7 || 7;
      weekStart.setDate(weekStart.getDate() + daysUntilNextSunday);
    }

    const dailySuggestions: DailySuggestion[] = [];
    const notes: string[] = [];

    for (let d = 0; d < 7; d++) {
      const dayData = dayOfWeekData.get(d)!;
      let historicalAvgPresent = 0;
      let historicalAvgAbsent = 0;
      let confidence = 0.3; // baseline

      if (dayData.present.length > 0) {
        historicalAvgPresent = ss.mean(dayData.present);
        const avgTotal = ss.mean(dayData.total);
        historicalAvgAbsent = avgTotal - historicalAvgPresent;

        // Confidence based on data points
        confidence = Math.min(0.95, 0.3 + dayData.present.length * 0.05);
      }

      // Suggested staff: round up historical average present + buffer for absences
      const absentRate =
        historicalAvgPresent + historicalAvgAbsent > 0
          ? historicalAvgAbsent / (historicalAvgPresent + historicalAvgAbsent)
          : 0.1;
      const suggestedStaff = Math.ceil(historicalAvgPresent * (1 + absentRate * 0.5));

      dailySuggestions.push({
        dayOfWeek: d,
        dayName: DAY_NAMES[d],
        suggestedStaff: Math.max(suggestedStaff, 0),
        historicalAvgPresent: Math.round(historicalAvgPresent * 10) / 10,
        historicalAvgAbsent: Math.round(historicalAvgAbsent * 10) / 10,
        confidence: Math.round(confidence * 100) / 100,
      });
    }

    // Generate notes
    const highAbsentDays = dailySuggestions.filter(
      (d) => d.historicalAvgAbsent > d.historicalAvgPresent * 0.2,
    );
    if (highAbsentDays.length > 0) {
      notes.push(
        `High absenteeism typically on: ${highAbsentDays.map((d) => d.dayName).join(', ')}`,
      );
    }

    const lowDataDays = dailySuggestions.filter((d) => d.confidence < 0.5);
    if (lowDataDays.length > 0) {
      notes.push(
        `Limited historical data for: ${lowDataDays.map((d) => d.dayName).join(', ')} - predictions may be less accurate`,
      );
    }

    if (activeEmployees > 0) {
      notes.push(`Total active employees: ${activeEmployees}`);
    }

    let predictionMethod: PredictionMethod = 'RULE_BASED';

    // --- Ollama enhancement ---
    try {
      const attendanceData = {
        dailySuggestions: dailySuggestions.map((d) => ({
          day: d.dayName,
          avgPresent: d.historicalAvgPresent,
          avgAbsent: d.historicalAvgAbsent,
        })),
      };
      const staffingData = { activeEmployees };
      const prompt = buildSchedulingPrompt(attendanceData, staffingData);
      const ollamaResult = await this.gateway.infer<{
        suggestions: Array<{ day: string; action: string; reason: string }>;
        overtime_analysis: Array<{ employee: string; hours: number; recommendation: string }>;
      }>(prompt);

      if (ollamaResult) {
        // Add Ollama's scheduling notes
        if (ollamaResult.data.suggestions?.length > 0) {
          for (const suggestion of ollamaResult.data.suggestions) {
            notes.push(`${suggestion.day}: ${suggestion.action} - ${suggestion.reason}`);
          }
        }
        predictionMethod = 'HYBRID';
      }
    } catch (error) {
      this.logger.warn(`Ollama scheduling failed, using rule-based: ${describeError(error)}`);
    }

    return {
      weekStart: weekStart.toISOString().split('T')[0],
      dailySuggestions,
      notes,
      predictionMethod,
    };
  }

  /**
   * Analyze current staffing needs per department
   */
  async getStaffingNeeds(organizationId: string): Promise<StaffingNeeds> {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Get employees by department
    const employees = await this.prisma.employee.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, department: true },
    });

    // Group employees by department
    const departmentStaff = new Map<string, string[]>();
    for (const emp of employees) {
      const dept = emp.department || 'Unassigned';
      if (!departmentStaff.has(dept)) {
        departmentStaff.set(dept, []);
      }
      departmentStaff.get(dept)!.push(emp.id);
    }

    // Get attendance data per department
    const attendance = await this.prisma.attendance.findMany({
      where: {
        organizationId,
        date: { gte: threeMonthsAgo },
      },
      select: {
        employeeId: true,
        status: true,
        date: true,
      },
    });

    // Map employee to department
    const employeeDeptMap = new Map<string, string>();
    for (const emp of employees) {
      employeeDeptMap.set(emp.id, emp.department || 'Unassigned');
    }

    // Calculate attendance rate per department
    const deptAttendance = new Map<string, { present: number; total: number }>();
    for (const record of attendance) {
      const dept = employeeDeptMap.get(record.employeeId) || 'Unassigned';
      if (!deptAttendance.has(dept)) {
        deptAttendance.set(dept, { present: 0, total: 0 });
      }
      const data = deptAttendance.get(dept)!;
      data.total++;
      if (record.status === 'PRESENT' || record.status === 'HALF_DAY') {
        data.present++;
      }
    }

    const departments: DepartmentStaffingNeed[] = [];

    for (const [dept, empIds] of departmentStaff) {
      const currentStaff = empIds.length;
      const attData = deptAttendance.get(dept);

      let recommendedStaff = currentStaff;
      if (attData && attData.total > 0) {
        const attendanceRate = attData.present / attData.total;
        // If attendance rate is low, recommend more staff to compensate
        if (attendanceRate < 0.9) {
          recommendedStaff = Math.ceil(currentStaff / attendanceRate);
        }
      }

      departments.push({
        name: dept,
        currentStaff,
        recommendedStaff,
        gap: recommendedStaff - currentStaff,
      });
    }

    departments.sort((a, b) => b.gap - a.gap);

    return {
      departments,
      totalCurrent: employees.length,
      totalRecommended: departments.reduce((sum, d) => sum + d.recommendedStaff, 0),
    };
  }

  /**
   * Analyze attendance patterns by day of week and month
   */
  async getAttendancePatterns(organizationId: string): Promise<AttendancePatterns> {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const attendance = await this.prisma.attendance.findMany({
      where: {
        organizationId,
        date: { gte: threeMonthsAgo },
      },
      select: {
        date: true,
        status: true,
      },
    });

    // By day of week
    const dayData = new Map<number, { present: number; absent: number }>();
    for (let d = 0; d < 7; d++) {
      dayData.set(d, { present: 0, absent: 0 });
    }

    // By month
    const monthData = new Map<number, { present: number; absent: number }>();
    for (let m = 0; m < 12; m++) {
      monthData.set(m, { present: 0, absent: 0 });
    }

    // Count unique dates per day-of-week for averaging
    const dayDates = new Map<number, Set<string>>();
    const monthDates = new Map<number, Set<string>>();
    for (let d = 0; d < 7; d++) dayDates.set(d, new Set());
    for (let m = 0; m < 12; m++) monthDates.set(m, new Set());

    for (const record of attendance) {
      const dow = record.date.getDay();
      const month = record.date.getMonth();
      const dateKey = record.date.toISOString().split('T')[0];
      const isPresent = record.status === 'PRESENT' || record.status === 'HALF_DAY';

      dayDates.get(dow)!.add(dateKey);
      monthDates.get(month)!.add(dateKey);

      if (isPresent) {
        dayData.get(dow)!.present++;
        monthData.get(month)!.present++;
      } else {
        dayData.get(dow)!.absent++;
        monthData.get(month)!.absent++;
      }
    }

    const byDayOfWeek: DayOfWeekPattern[] = [];
    for (let d = 0; d < 7; d++) {
      const data = dayData.get(d)!;
      const uniqueDays = dayDates.get(d)!.size || 1;
      const total = data.present + data.absent;
      byDayOfWeek.push({
        day: d,
        dayName: DAY_NAMES[d],
        avgPresent: Math.round((data.present / uniqueDays) * 10) / 10,
        avgAbsent: Math.round((data.absent / uniqueDays) * 10) / 10,
        attendanceRate: total > 0 ? Math.round((data.present / total) * 10000) / 10000 : 0,
      });
    }

    const byMonth: MonthlyPattern[] = [];
    for (let m = 0; m < 12; m++) {
      const data = monthData.get(m)!;
      const uniqueDays = monthDates.get(m)!.size || 1;
      const total = data.present + data.absent;
      if (total === 0) continue; // Skip months with no data
      byMonth.push({
        month: m,
        monthName: MONTH_NAMES[m],
        avgPresent: Math.round((data.present / uniqueDays) * 10) / 10,
        avgAbsent: Math.round((data.absent / uniqueDays) * 10) / 10,
        attendanceRate: total > 0 ? Math.round((data.present / total) * 10000) / 10000 : 0,
      });
    }

    return { byDayOfWeek, byMonth };
  }

  /**
   * Detect overtime patterns across the organization
   */
  async getOvertimeAnalysis(organizationId: string): Promise<OvertimeAnalysis> {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const attendance = await this.prisma.attendance.findMany({
      where: {
        organizationId,
        date: { gte: threeMonthsAgo },
        status: 'PRESENT',
        checkIn: { not: null },
        checkOut: { not: null },
      },
      select: {
        employeeId: true,
        checkIn: true,
        checkOut: true,
      },
    });

    // Build employee overtime map
    const employeeOvertime = new Map<string, { totalHours: number; days: number }>();

    let totalOvertimeHours = 0;

    for (const record of attendance) {
      if (!record.checkIn || !record.checkOut) continue;

      const hoursWorked = (record.checkOut.getTime() - record.checkIn.getTime()) / (1000 * 60 * 60);

      if (hoursWorked > STANDARD_WORK_HOURS) {
        const overtimeHours = hoursWorked - STANDARD_WORK_HOURS;
        totalOvertimeHours += overtimeHours;

        if (!employeeOvertime.has(record.employeeId)) {
          employeeOvertime.set(record.employeeId, { totalHours: 0, days: 0 });
        }
        const data = employeeOvertime.get(record.employeeId)!;
        data.totalHours += overtimeHours;
        data.days++;
      }
    }

    // Get employee details for top overtime workers
    const sortedEmployees = Array.from(employeeOvertime.entries())
      .sort((a, b) => b[1].totalHours - a[1].totalHours)
      .slice(0, 10);

    const employeeIds = sortedEmployees.map(([id]) => id);
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds }, organizationId },
      select: { id: true, name: true, department: true },
    });

    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    const topOvertimeEmployees: OvertimeEmployee[] = sortedEmployees.map(([empId, data]) => {
      const emp = employeeMap.get(empId);
      return {
        employeeId: empId,
        employeeName: emp?.name || 'Unknown',
        department: emp?.department || null,
        totalOvertimeHours: Math.round(data.totalHours * 10) / 10,
        overtimeDays: data.days,
      };
    });

    // Generate recommendations
    const recommendations: string[] = [];

    if (employeeOvertime.size > employees.length * 0.3) {
      recommendations.push(
        'More than 30% of employees are working overtime regularly - consider hiring additional staff',
      );
    }

    const heavyOvertimeEmployees = sortedEmployees.filter(([, data]) => data.days > 20);
    if (heavyOvertimeEmployees.length > 0) {
      recommendations.push(
        `${heavyOvertimeEmployees.length} employee(s) worked overtime more than 20 days in the last 3 months - risk of burnout`,
      );
    }

    // Check if overtime is concentrated in specific departments
    const deptOvertime = new Map<string, number>();
    for (const [empId, data] of employeeOvertime) {
      const dept = employeeMap.get(empId)?.department || 'Unknown';
      deptOvertime.set(dept, (deptOvertime.get(dept) || 0) + data.totalHours);
    }

    const topDept = Array.from(deptOvertime.entries()).sort((a, b) => b[1] - a[1]);
    if (topDept.length > 0 && totalOvertimeHours > 0) {
      const topDeptPercent = (topDept[0][1] / totalOvertimeHours) * 100;
      if (topDeptPercent > 50) {
        recommendations.push(
          `${topDept[0][0]} department accounts for ${topDeptPercent.toFixed(0)}% of all overtime - investigate workload distribution`,
        );
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Overtime levels are within normal range');
    }

    return {
      totalOvertimeHours: Math.round(totalOvertimeHours * 10) / 10,
      employeesAffected: employeeOvertime.size,
      topOvertimeEmployees,
      recommendations,
    };
  }
}
