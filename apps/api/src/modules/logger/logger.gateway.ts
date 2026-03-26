import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { LogEntry } from '@mizano/shared-types';

// Parse comma-separated CORS origins (same logic as main.ts bootstrap)
const loggerWsOriginRaw =
  process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5001';
const loggerWsOrigins = loggerWsOriginRaw.split(',').map((o) => o.trim());

@WebSocketGateway({
  namespace: '/logger',
  cors: {
    origin: loggerWsOrigins.length === 1 ? loggerWsOrigins[0] : loggerWsOrigins,
    credentials: true,
  },
})
export class LoggerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LoggerGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Logger client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Logger client disconnected: ${client.id}`);
  }

  /**
   * Broadcast a new log entry to all connected clients
   */
  broadcastLog(entry: LogEntry) {
    this.server?.emit('new-log', entry);
  }

  /**
   * Broadcast that logs have been cleared
   */
  broadcastClear(removedCount: number) {
    this.server?.emit('logs-cleared', { removed: removedCount });
  }

  /**
   * Broadcast status update
   */
  broadcastStatusUpdate(ids: string[], status: string) {
    this.server?.emit('status-updated', { ids, status });
  }
}
