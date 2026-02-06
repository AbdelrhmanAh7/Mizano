import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ImportController } from './controllers/import.controller';
import { ExportController } from './controllers/export.controller';
import { ImportService } from './services/import.service';
import { ExportService } from './services/export.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max file size
      },
    }),
  ],
  controllers: [ImportController, ExportController],
  providers: [ImportService, ExportService],
  exports: [ImportService, ExportService],
})
export class ImportExportModule {}
