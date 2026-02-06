import { Module } from '@nestjs/common';
import { DocumentsController } from './controllers/documents.controller';
import { PdfService } from './services/pdf.service';
import { EmailService } from './services/email.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DocumentsController],
  providers: [PdfService, EmailService],
  exports: [PdfService, EmailService],
})
export class DocumentsModule {}
