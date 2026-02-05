import { Module } from '@nestjs/common';
import { ProjectsService } from './services/projects.service';
import { TasksService } from './services/tasks.service';
import { TimesheetsService } from './services/timesheets.service';
import { ProjectsController } from './controllers/projects.controller';
import { TasksController } from './controllers/tasks.controller';
import { TimesheetsController } from './controllers/timesheets.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProjectsController, TasksController, TimesheetsController],
  providers: [ProjectsService, TasksService, TimesheetsService],
  exports: [ProjectsService, TasksService, TimesheetsService],
})
export class ProjectsModule {}
