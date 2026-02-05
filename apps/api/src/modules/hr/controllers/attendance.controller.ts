import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AttendanceService } from '../services/attendance.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('attendance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('clock-in')
  @Permissions('hr.create')
  @ApiOperation({ summary: 'Clock in for the day' })
  clockIn(@CurrentOrg() orgId: string, @Body() dto: { employeeId: string; notes?: string }) {
    return this.attendanceService.clockIn(orgId, dto.employeeId, dto.notes);
  }

  @Post('clock-out')
  @Permissions('hr.create')
  @ApiOperation({ summary: 'Clock out for the day' })
  clockOut(@CurrentOrg() orgId: string, @Body() dto: { employeeId: string; notes?: string }) {
    return this.attendanceService.clockOut(orgId, dto.employeeId, dto.notes);
  }

  @Post()
  @Permissions('hr.create')
  @ApiOperation({ summary: 'Record attendance manually' })
  record(@CurrentOrg() orgId: string, @Body() dto: any) {
    return this.attendanceService.recordAttendance(orgId, dto);
  }

  @Post('bulk')
  @Permissions('hr.create')
  @ApiOperation({ summary: 'Bulk record attendance' })
  bulkRecord(@CurrentOrg() orgId: string, @Body() dto: { records: any[] }) {
    return this.attendanceService.bulkRecordAttendance(orgId, dto.records);
  }

  @Get('by-employee/:employeeId')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Get attendance records for an employee' })
  getByEmployee(
    @CurrentOrg() orgId: string,
    @Param('employeeId') employeeId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.attendanceService.getAttendanceByEmployee(orgId, employeeId, startDate, endDate);
  }

  @Get('by-date/:date')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Get attendance for a specific date' })
  getByDate(@CurrentOrg() orgId: string, @Param('date') date: string) {
    return this.attendanceService.getAttendanceByDate(orgId, date);
  }

  @Get('summary/:employeeId')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Get attendance summary for employee' })
  getSummary(
    @CurrentOrg() orgId: string,
    @Param('employeeId') employeeId: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.attendanceService.getAttendanceSummary(orgId, employeeId, parseInt(month), parseInt(year));
  }

  @Put(':id')
  @Permissions('hr.edit')
  @ApiOperation({ summary: 'Update attendance record' })
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) {
    return this.attendanceService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('hr.delete')
  @ApiOperation({ summary: 'Delete attendance record' })
  delete(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.attendanceService.delete(orgId, id);
  }
}
