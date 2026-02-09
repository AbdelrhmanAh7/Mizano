import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsGateway, EntityEvent } from './notifications.gateway';

@Injectable()
export class EntityEventListener {
  constructor(private readonly gateway: NotificationsGateway) {}

  @OnEvent('entity.**')
  handleEntityEvent(event: EntityEvent) {
    this.gateway.broadcastEntityEvent(event);
  }

  @OnEvent('notification.created')
  handleNotification(payload: {
    organizationId: string;
    title: string;
    message: string;
    type: string;
    entityType?: string;
    entityId?: string;
  }) {
    this.gateway.broadcastNotification(payload.organizationId, {
      title: payload.title,
      message: payload.message,
      type: payload.type,
      entityType: payload.entityType,
      entityId: payload.entityId,
    });
  }
}
