import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiOperationsModule } from '../ai/operations/ai-operations.module';
import { TelegramClient, TelegramHttpClient } from './telegram.client';
import { TelegramController } from './telegram.controller';
import { TelegramIntakeService } from './telegram-intake.service';
import { TelegramLinkService } from './telegram-link.service';

@Module({
  imports: [PrismaModule, ConfigModule, AiOperationsModule],
  controllers: [TelegramController],
  providers: [
    { provide: TelegramClient, useClass: TelegramHttpClient },
    TelegramLinkService,
    TelegramIntakeService,
  ],
})
export class TelegramModule {}
