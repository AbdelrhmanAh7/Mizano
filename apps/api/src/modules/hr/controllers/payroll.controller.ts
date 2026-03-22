import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PayrollService } from '../services/payroll.service';

@ApiTags('Payroll')
@ApiBearerAuth()
@Controller('payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('runs')
  @Permissions('payroll.create')
  @ApiOperation({ summary: 'Create a new payroll run' })
  createRun(@CurrentOrg() orgId: string, @Body() dto: { month: number; year: number }) {
    return this.payrollService.createPayrollRun(orgId, dto);
  }

  @Get('runs')
  @Permissions('payroll.view')
  @ApiOperation({ summary: 'Get all payroll runs' })
  getRuns(
    @CurrentOrg() orgId: string,
    @Query()
    query: {
      status?: string;
      year?: number;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: string;
    },
  ) {
    return this.payrollService.getPayrollRuns(orgId, query);
  }

  @Get('runs/:id')
  @Permissions('payroll.view')
  @ApiOperation({ summary: 'Get payroll run details' })
  getRun(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.payrollService.getPayrollRun(orgId, id);
  }

  @Post('runs/:id/calculate')
  @Permissions('payroll.create')
  @ApiOperation({ summary: 'Calculate payroll for all employees' })
  calculate(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.payrollService.calculatePayroll(orgId, id);
  }

  @Post('runs/:id/paid')
  @Permissions('payroll.process')
  @ApiOperation({ summary: 'Mark payroll as paid' })
  markAsPaid(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.payrollService.markAsPaid(orgId, id);
  }

  @Delete('runs/:id')
  @Permissions('payroll.delete')
  @ApiOperation({ summary: 'Delete payroll run' })
  deleteRun(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.payrollService.deletePayrollRun(orgId, id);
  }

  @Get('payslips/employee/:employeeId')
  @Permissions('payroll.view')
  @ApiOperation({ summary: 'Get employee payslips' })
  getEmployeePayslips(@CurrentOrg() orgId: string, @Param('employeeId') employeeId: string) {
    return this.payrollService.getEmployeePayslips(orgId, employeeId);
  }

  @Get('payslips/:id')
  @Permissions('payroll.view')
  @ApiOperation({ summary: 'Get payslip details' })
  getPayslip(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.payrollService.getPayslip(orgId, id);
  }

  // Bulk Operations
  @Post('runs/bulk-delete')
  @Permissions('payroll.delete')
  @ApiOperation({ summary: 'Bulk delete payroll runs' })
  bulkDelete(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.payrollService.bulkDelete(orgId, dto.ids);
  }

  @Post('runs/bulk-process')
  @Permissions('payroll.create')
  @ApiOperation({ summary: 'Bulk process payroll runs' })
  bulkProcess(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.payrollService.bulkProcess(orgId, dto.ids);
  }

  @Post('runs/bulk-pay')
  @Permissions('payroll.process')
  @ApiOperation({ summary: 'Bulk mark payroll runs as paid' })
  bulkPay(@CurrentOrg() orgId: string, @Body() dto: { ids: string[] }) {
    return this.payrollService.bulkMarkPaid(orgId, dto.ids);
  }
}
