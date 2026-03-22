import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { UpdateEmployeeDto } from '../dto/update-employee.dto';
import { EmployeeCursorQueryDto } from '../dto/employee-cursor-query.dto';
import { EmployeesService } from '../services/employees.service';

@ApiTags('Employees')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Permissions('hr.create')
  @ApiOperation({ summary: 'Create a new employee' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(orgId, dto);
  }

  @Get()
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Get all employees' })
  findAll(
    @CurrentOrg() orgId: string,
    @Query() query: PaginationDto & { status?: string; isActive?: string; department?: string },
  ) {
    return this.employeesService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'List employees with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: EmployeeCursorQueryDto) {
    return this.employeesService.findAllCursor(orgId, query);
  }

  @Get('summary')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Get employee summary by department' })
  getDepartmentSummary(@CurrentOrg() orgId: string) {
    return this.employeesService.getDepartmentSummary(orgId);
  }

  @Get('count')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Get active employees count' })
  getActiveCount(@CurrentOrg() orgId: string) {
    return this.employeesService.getActiveEmployeesCount(orgId);
  }

  @Get(':id')
  @Permissions('hr.view')
  @ApiOperation({ summary: 'Get employee by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.employeesService.findOne(orgId, id);
  }

  @Put(':id')
  @Permissions('hr.edit')
  @ApiOperation({ summary: 'Update employee' })
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('hr.delete')
  @ApiOperation({ summary: 'Delete employee' })
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.employeesService.remove(orgId, id);
  }

  @Post(':id/terminate')
  @Permissions('hr.edit')
  @ApiOperation({ summary: 'Terminate employee' })
  terminate(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.employeesService.terminate(orgId, id);
  }
}
