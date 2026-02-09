import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

export interface EntityEvent {
  type: 'CREATED' | 'UPDATED' | 'DELETED' | 'STATUS_CHANGED';
  entityType: string;
  entityId: string;
  organizationId: string;
  data?: Record<string, any>;
  userId?: string;
  timestamp: string;
}

@WebSocketGateway({
  namespace: '/events',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private orgRooms = new Map<string, Set<string>>();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    for (const [orgId, sockets] of this.orgRooms.entries()) {
      sockets.delete(client.id);
      if (sockets.size === 0) this.orgRooms.delete(orgId);
    }
  }

  @SubscribeMessage('join-org')
  handleJoinOrg(client: Socket, orgId: string) {
    client.join(`org:${orgId}`);
    if (!this.orgRooms.has(orgId)) {
      this.orgRooms.set(orgId, new Set());
    }
    this.orgRooms.get(orgId)!.add(client.id);
    this.logger.log(`Client ${client.id} joined org: ${orgId}`);
  }

  @SubscribeMessage('leave-org')
  handleLeaveOrg(client: Socket, orgId: string) {
    client.leave(`org:${orgId}`);
    this.orgRooms.get(orgId)?.delete(client.id);
    this.logger.log(`Client ${client.id} left org: ${orgId}`);
  }

  /**
   * Broadcast an entity event to all clients in the organization room.
   * Call this from any service to push real-time updates to the frontend.
   */
  broadcastEntityEvent(event: EntityEvent) {
    this.server?.to(`org:${event.organizationId}`).emit('entity-event', event);
    this.logger.debug(
      `Broadcast entity-event: ${event.type} ${event.entityType}#${event.entityId} to org:${event.organizationId}`,
    );
  }

  /**
   * Broadcast a notification to a specific organization
   */
  broadcastNotification(
    orgId: string,
    notification: {
      title: string;
      message: string;
      type: string;
      entityType?: string;
      entityId?: string;
    },
  ) {
    this.server?.to(`org:${orgId}`).emit('notification', {
      ...notification,
      timestamp: new Date().toISOString(),
    });
    this.logger.debug(
      `Broadcast notification: "${notification.title}" to org:${orgId}`,
    );
  }

  /**
   * Get the number of connected clients for an organization
   */
  getOrgConnectionCount(orgId: string): number {
    return this.orgRooms.get(orgId)?.size ?? 0;
  }
}
