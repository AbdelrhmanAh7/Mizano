import { Module } from '@nestjs/common';
import { EmployeesService } from './services/employees.service';
import { AttendanceService } from './services/attendance.service';
import { PayrollService } from './services/payroll.service';
import { EmployeesController } from './controllers/employees.controller';
import { AttendanceController } from './controllers/attendance.controller';
import { PayrollController } from './controllers/payroll.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EmployeesController, AttendanceController, PayrollController],
  providers: [EmployeesService, AttendanceService, PayrollService],
  exports: [EmployeesService, AttendanceService, PayrollService],
})
export class HrModule {}
