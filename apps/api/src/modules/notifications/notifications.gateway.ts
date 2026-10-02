import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { describeError } from '../../common/utils/redact';

export interface EntityEvent {
  type: 'CREATED' | 'UPDATED' | 'DELETED' | 'STATUS_CHANGED';
  entityType: string;
  entityId: string;
  organizationId: string;
  data?: Record<string, unknown>;
  userId?: string;
  timestamp: string;
}

interface NotificationsJwtPayload {
  sub: string;
  exp?: number;
}

export interface NotificationsSocketUser {
  id: string;
  organizationId: string;
}

/** Max delay for setTimeout (2^31 - 1 ms). */
const MAX_TIMER_MS = 2_147_483_647;

/** Room that carries the events/notifications of one organization. */
export function notificationsOrgRoom(organizationId: string): string {
  return `org:${organizationId}`;
}

// Parse comma-separated CORS origins (same logic as main.ts bootstrap)
const wsOriginRaw = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5001';
const wsOrigins = wsOriginRaw.split(',').map((o) => o.trim());

@WebSocketGateway({
  namespace: '/events',
  cors: {
    origin: wsOrigins.length === 1 ? wsOrigins[0] : wsOrigins,
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly orgRooms = new Map<string, Set<string>>();
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /** Reject unauthenticated handshakes before a connection is ever established. */
  afterInit(server: Server): void {
    server.use((socket, next) => {
      this.authenticate(socket)
        .then(() => next())
        .catch(() => next(new Error('Unauthorized')));
    });
  }

  handleConnection(client: Socket): void {
    const user = client.data?.user as NotificationsSocketUser | undefined;
    if (!user) {
      // Defence in depth: the handshake middleware should have rejected this already.
      client.disconnect(true);
      return;
    }

    const orgId = user.organizationId;
    void client.join(notificationsOrgRoom(orgId));
    if (!this.orgRooms.has(orgId)) {
      this.orgRooms.set(orgId, new Set());
    }
    this.orgRooms.get(orgId)!.add(client.id);
    this.scheduleExpiry(client);
    this.logger.log(`Client connected: ${client.id} (org: ${orgId})`);
  }

  handleDisconnect(client: Socket): void {
    const timer = this.expiryTimers.get(client.id);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(client.id);
    }
    this.logger.log(`Client disconnected: ${client.id}`);
    for (const [orgId, sockets] of this.orgRooms.entries()) {
      sockets.delete(client.id);
      if (sockets.size === 0) this.orgRooms.delete(orgId);
    }
  }

  /**
   * Verify the handshake token; on success stores the user on `socket.data`.
   * Rejects (without saying why) otherwise.
   */
  async authenticate(socket: Socket): Promise<NotificationsSocketUser> {
    const token = this.extractToken(socket);
    if (!token) throw new Error('missing token');

    let payload: NotificationsJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<NotificationsJwtPayload>(token);
    } catch (error) {
      this.logger.warn(
        `Notifications socket rejected: ${describeError(error, { includeMessage: false })}`,
      );
      throw new Error('invalid token');
    }
    if (!payload?.sub) throw new Error('invalid token');

    const user = await this.prisma.user
      .findUnique({
        where: { id: payload.sub },
        select: { id: true, status: true, organizationId: true },
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Notifications socket authentication failed: ${describeError(error, { includeMessage: false })}`,
        );
        throw new Error('Unauthorized');
      });
    if (!user || user.status !== 'ACTIVE' || !user.organizationId) {
      throw new Error('inactive user');
    }

    const socketUser: NotificationsSocketUser = {
      id: user.id,
      organizationId: user.organizationId,
    };
    socket.data.user = socketUser;
    socket.data.tokenExpiresAt = typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
    return socketUser;
  }

  @SubscribeMessage('join-org')
  handleJoinOrg(client: Socket, _orgId?: string): void {
    const user = client.data?.user as NotificationsSocketUser | undefined;
    if (!user) {
      client.disconnect(true);
      return;
    }
    // Always use user's organizationId from the verified user session, never client-supplied orgId
    const orgId = user.organizationId;
    void client.join(notificationsOrgRoom(orgId));
    if (!this.orgRooms.has(orgId)) {
      this.orgRooms.set(orgId, new Set());
    }
    this.orgRooms.get(orgId)!.add(client.id);
    this.logger.log(`Client ${client.id} joined org: ${orgId}`);
  }

  @SubscribeMessage('leave-org')
  handleLeaveOrg(client: Socket, _orgId?: string): void {
    const user = client.data?.user as NotificationsSocketUser | undefined;
    if (!user) {
      client.disconnect(true);
      return;
    }
    const orgId = user.organizationId;
    void client.leave(notificationsOrgRoom(orgId));
    this.orgRooms.get(orgId)?.delete(client.id);
    this.logger.log(`Client ${client.id} left org: ${orgId}`);
  }

  /**
   * Broadcast an entity event to all clients in the organization room.
   * Call this from any service to push real-time updates to the frontend.
   */
  broadcastEntityEvent(event: EntityEvent): void {
    if (!event.organizationId) return;
    this.server?.to(notificationsOrgRoom(event.organizationId)).emit('entity-event', event);
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
  ): void {
    if (!orgId) return;
    this.server?.to(notificationsOrgRoom(orgId)).emit('notification', {
      ...notification,
      timestamp: new Date().toISOString(),
    });
    this.logger.debug(`Broadcast notification: "${notification.title}" to org:${orgId}`);
  }

  /**
   * Get the number of connected clients for an organization
   */
  getOrgConnectionCount(orgId: string): number {
    return this.orgRooms.get(orgId)?.size ?? 0;
  }

  private extractToken(socket: Socket): string | undefined {
    const auth = socket.handshake?.auth as Record<string, unknown> | undefined;
    if (typeof auth?.token === 'string' && auth.token.length > 0) {
      return auth.token;
    }
    const header = socket.handshake?.headers?.authorization;
    if (typeof header === 'string') {
      const match = /^Bearer\s+(\S+)$/i.exec(header);
      if (match) return match[1];
    }
    return undefined;
  }

  private scheduleExpiry(client: Socket): void {
    const expiresAt = client.data?.tokenExpiresAt as number | undefined;
    if (!expiresAt) return;
    const delay = Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMER_MS);
    const timer = setTimeout(() => {
      this.expiryTimers.delete(client.id);
      client.disconnect(true);
    }, delay);
    timer.unref?.();
    this.expiryTimers.set(client.id, timer);
  }
}
