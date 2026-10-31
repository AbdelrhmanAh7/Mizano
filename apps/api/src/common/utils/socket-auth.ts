import type { Server, Socket } from 'socket.io';

/** Max delay for setTimeout (2^31 - 1 ms). */
const MAX_TIMER_MS = 2_147_483_647;

/** The bearer token of a socket handshake: `auth.token`, else an `Authorization: Bearer` header. */
export function extractSocketToken(socket: Socket): string | undefined {
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

/** Reject unauthenticated handshakes before a connection is ever established. */
export function rejectUnauthenticatedHandshakes(
  server: Server,
  authenticate: (socket: Socket) => Promise<unknown>,
): void {
  server.use((socket, next) => {
    authenticate(socket)
      .then(() => next())
      .catch(() => next(new Error('Unauthorized')));
  });
}

/**
 * Disconnects each socket when its token expires (`socket.data.tokenExpiresAt`, epoch ms), so a
 * connection never outlives the credential it was opened with.
 */
export class SocketExpiryTimers {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  schedule(client: Socket): void {
    const expiresAt = client.data?.tokenExpiresAt as number | undefined;
    if (!expiresAt) return;
    const delay = Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMER_MS);
    const timer = setTimeout(() => {
      this.timers.delete(client.id);
      client.disconnect(true);
    }, delay);
    timer.unref?.();
    this.timers.set(client.id, timer);
  }

  clear(clientId: string): void {
    const timer = this.timers.get(clientId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(clientId);
    }
  }
}
