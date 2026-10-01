import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { LoggerService } from './logger.service';
import { LoggerController } from './logger.controller';
import { LoggerGateway } from './logger.gateway';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@Global()
@Module({
  imports: [
    // Verifies access tokens on the WebSocket handshake (same secret as the REST JWT strategy)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.get<string>('JWT_SECRET') }),
    }),
  ],
  controllers: [LoggerController],
  providers: [LoggerService, LoggerGateway, PermissionsGuard],
  exports: [LoggerService],
})
export class LoggerModule {}
