import { Module, Global } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { LoggerController } from './logger.controller';
import { LoggerGateway } from './logger.gateway';

@Global()
@Module({
  controllers: [LoggerController],
  providers: [LoggerService, LoggerGateway],
  exports: [LoggerService],
})
export class LoggerModule {}
