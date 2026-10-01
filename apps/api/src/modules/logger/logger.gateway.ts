import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ExecutionContext, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LogEntry } from '@mizano/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { describeError } from '../../common/utils/redact';

// Parse comma-separated CORS origins (same logic as main.ts bootstrap)
const loggerWsOriginRaw =
  process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5001';
const loggerWsOrigins = loggerWsOriginRaw.split(',').map((o) => o.trim());

/** Same permission as `GET /logger/logs`: admin-level (Admin role), see LoggerController. */
class LoggerSocketAccess {
  @Permissions('settings.edit')
  connect(): void {
    // Metadata carrier only: lets PermissionsGuard evaluate the same rule as the REST API.
  }
}

interface LoggerJwtPayload {
  sub: string;
  exp?: number;
}

export interface LoggerSocketUser {
  id: string;
  organizationId: string;
}

/** Max delay for setTimeout (2^31 - 1 ms). */
const MAX_TIMER_MS = 2_147_483_647;

/** Room that carries the log events of one organization. */
export function loggerOrgRoom(organizationId: string): string {
  return `org:${organizationId}`;
}

/**
 * Real-time log stream.
 *
 * - The handshake must carry a valid access token (`auth: { token }` or an
 *   `Authorization: Bearer` header; never a query string, which ends up in access logs).
 *   The user must be ACTIVE and hold the same permission as the REST endpoints.
 * - Sockets are placed in a room for the organization taken from the verified user, never
 *   from client input, and every broadcast targets exactly one organization's room.
 * - A socket is disconnected when its token expires; clients reconnect with a fresh token.
 * - There are no client-to-server events: a connected socket can only listen.
 */
@WebSocketGateway({
  namespace: '/logger',
  cors: {
    origin: loggerWsOrigins.length === 1 ? loggerWsOrigins[0] : loggerWsOrigins,
    credentials: true,
  },
})
export class LoggerGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LoggerGateway.name);
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly permissionsGuard: PermissionsGuard,
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
    const user = client.data?.user as LoggerSocketUser | undefined;
    if (!user) {
      // Defence in depth: the handshake middleware should have rejected this already.
      client.disconnect(true);
      return;
    }

    void client.join(loggerOrgRoom(user.organizationId));
    this.scheduleExpiry(client);
    this.logger.log(`Logger client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    const timer = this.expiryTimers.get(client.id);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(client.id);
    }
    this.logger.log(`Logger client disconnected: ${client.id}`);
  }

  /**
   * Verify the handshake token and permission; on success stores the user on
   * `socket.data`. Rejects (without saying why) otherwise.
   */
  async authenticate(socket: Socket): Promise<LoggerSocketUser> {
    const token = this.extractToken(socket);
    if (!token) throw new Error('missing token');

    let payload: LoggerJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<LoggerJwtPayload>(token);
    } catch (error) {
      this.logger.warn(
        `Logger socket rejected: ${describeError(error, { includeMessage: false })}`,
      );
      throw new Error('invalid token');
    }
    if (!payload?.sub) throw new Error('invalid token');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, status: true, organizationId: true, roleId: true },
    });
    if (!user || user.status !== 'ACTIVE' || !user.organizationId) {
      throw new Error('inactive user');
    }

    if (!(await this.hasLogAccess(user))) {
      throw new Error('forbidden');
    }

    const socketUser: LoggerSocketUser = { id: user.id, organizationId: user.organizationId };
    socket.data.user = socketUser;
    socket.data.tokenExpiresAt = typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
    return socketUser;
  }

  /**
   * Broadcast a new log entry to the entry's own organization only. Entries without an
   * organization (system entries) are never broadcast.
   */
  broadcastLog(entry: LogEntry): void {
    if (!entry.organizationId) return;
    this.server?.to(loggerOrgRoom(entry.organizationId)).emit('new-log', entry);
  }

  /** Broadcast that an organization's logs have been cleared. */
  broadcastClear(organizationId: string, removedCount: number): void {
    if (!organizationId) return;
    this.server?.to(loggerOrgRoom(organizationId)).emit('logs-cleared', { removed: removedCount });
  }

  /** Broadcast a status update to one organization. */
  broadcastStatusUpdate(organizationId: string, ids: string[], status: string): void {
    if (!organizationId) return;
    this.server?.to(loggerOrgRoom(organizationId)).emit('status-updated', { ids, status });
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

  private async hasLogAccess(user: { id: string; roleId: string | null }): Promise<boolean> {
    const context = {
      getHandler: () => LoggerSocketAccess.prototype.connect,
      getClass: () => LoggerSocketAccess,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
    try {
      return await this.permissionsGuard.canActivate(context);
    } catch {
      return false;
    }
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
