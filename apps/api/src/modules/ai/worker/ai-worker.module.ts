import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from '../../../cache/cache.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiCoreModule } from '../core/ai-core.module';
import { AiNlpModule } from '../nlp/ai-nlp.module';
import { OllamaService } from '../services/ollama.service';
import { PaddleOcrService } from '../services/paddle-ocr.service';
import { DocumentIntakeService } from '../services/document-intake.service';
import { VlmStrategy } from '../extraction/vlm-strategy.service';
import { OcrLlmStrategy } from '../extraction/ocr-llm-strategy.service';
import { HybridStrategy } from '../extraction/hybrid-strategy.service';
import { RulesStrategy } from '../extraction/rules-strategy.service';
import { ExtractionStrategyResolver } from '../extraction/extraction-strategy-resolver.service';
import { IntakeProcessorService } from '../intake/intake-processor.service';
import { IntakeQueueService } from '../intake/intake-queue.service';
import { IntakeStorage, LocalFsIntakeStorage } from '../intake/intake-storage';

/**
 * Worker-side intake graph: the only place that loads OCR / PDF extraction
 * (tesseract.js, pdf-parse). IntakeProcessorService registers the queue
 * handler in onModuleInit, so booting this module starts consuming jobs.
 */
@Module({
  imports: [
    // The worker is its own process, so it loads env files and the event bus itself (AppModule does the same).
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.APP_ENV || 'local'}`,
        '.env',
        `../../.env.${process.env.APP_ENV || 'local'}`,
        '../../.env',
      ],
    }),
    EventEmitterModule.forRoot(),
    CacheModule,
    PrismaModule,
    AiCoreModule,
    AiNlpModule,
  ],
  providers: [
    OllamaService,
    PaddleOcrService,
    VlmStrategy,
    OcrLlmStrategy,
    HybridStrategy,
    RulesStrategy,
    ExtractionStrategyResolver,
    DocumentIntakeService,
    IntakeProcessorService,
    IntakeQueueService,
    { provide: IntakeStorage, useClass: LocalFsIntakeStorage },
  ],
})
export class AiWorkerModule {}
