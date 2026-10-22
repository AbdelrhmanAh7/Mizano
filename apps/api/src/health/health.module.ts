import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CacheModule } from '../cache/cache.module';
import { IntakeQueueService } from '../modules/ai/intake/intake-queue.service';

@Module({
  imports: [PrismaModule, CacheModule],
  controllers: [HealthController],
  providers: [IntakeQueueService],
})
export class HealthModule {}
