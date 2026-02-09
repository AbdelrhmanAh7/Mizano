import { Module } from '@nestjs/common';
import { NotificationsService } from './services/notifications.service';
import { NotificationsController } from './controllers/notifications.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsGateway } from './notifications.gateway';
import { EntityEventListener } from './entity-event.listener';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    EntityEventListener,
  ],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
