import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaModule } from '../../prisma/prisma.module';
import { ExportController } from './controllers/export.controller';
import { ImportController } from './controllers/import.controller';
import { BulkExportService } from './services/bulk-export.service';
import { ExportService } from './services/export.service';
import { ImportService } from './services/import.service';

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
  providers: [ImportService, ExportService, BulkExportService],
  exports: [ImportService, ExportService, BulkExportService],
})
export class ImportExportModule {}
