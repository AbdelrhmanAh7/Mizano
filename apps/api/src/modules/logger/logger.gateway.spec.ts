import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { LogLevel, LogSource, LogStatus, LogEntry } from '@mizano/shared-types';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerGateway, loggerOrgRoom } from './logger.gateway';

interface FakeSocket {
  id: string;
  handshake: { auth?: Record<string, unknown>; headers: Record<string, string> };
  data: Record<string, unknown>;
  join: jest.Mock;
  disconnect: jest.Mock;
}

function makeSocket(
  handshake: Partial<FakeSocket['handshake']> = {},
  id = 'socket-1',
): FakeSocket & Socket {
  return {
    id,
    handshake: { headers: {}, ...handshake },
    data: {},
    join: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  } as unknown as FakeSocket & Socket;
}

describe('LoggerGateway', () => {
  let verifyAsync: jest.Mock;
  let findUnique: jest.Mock;
  let canActivate: jest.Mock;
  let gateway: LoggerGateway;

  beforeEach(() => {
    verifyAsync = jest.fn();
    findUnique = jest.fn();
    canActivate = jest.fn().mockResolvedValue(true);
    gateway = new LoggerGateway(
      { verifyAsync } as unknown as JwtService,
      { user: { findUnique } } as unknown as PrismaService,
      { canActivate } as unknown as PermissionsGuard,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const activeUser = {
    id: 'user-1',
    status: 'ACTIVE',
    organizationId: 'org-a',
    roleId: 'role-1',
  };

  describe('handshake authentication', () => {
    it('rejects a handshake without a token', async () => {
      await expect(gateway.authenticate(makeSocket())).rejects.toThrow();
      expect(verifyAsync).not.toHaveBeenCalled();
    });

    it('rejects an invalid or expired token', async () => {
      verifyAsync.mockRejectedValue(new Error('jwt expired'));
      await expect(
        gateway.authenticate(makeSocket({ auth: { token: 'bad.token.value' } })),
      ).rejects.toThrow();
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('does not accept the token from the query string', async () => {
      const socket = makeSocket();
      (socket.handshake as unknown as { query: Record<string, string> }).query = {
        token: 'from-query',
      };
      await expect(gateway.authenticate(socket)).rejects.toThrow();
      expect(verifyAsync).not.toHaveBeenCalled();
    });

    it('rejects unknown or inactive users', async () => {
      verifyAsync.mockResolvedValue({ sub: 'user-1' });
      findUnique.mockResolvedValue(null);
      await expect(gateway.authenticate(makeSocket({ auth: { token: 't' } }))).rejects.toThrow();

      findUnique.mockResolvedValue({ ...activeUser, status: 'SUSPENDED' });
      await expect(gateway.authenticate(makeSocket({ auth: { token: 't' } }))).rejects.toThrow();
    });

    it('rejects users without the admin-level permission', async () => {
      verifyAsync.mockResolvedValue({ sub: 'user-1' });
      findUnique.mockResolvedValue(activeUser);
      canActivate.mockRejectedValue(new Error('Missing permission: settings.edit'));

      await expect(gateway.authenticate(makeSocket({ auth: { token: 't' } }))).rejects.toThrow();
    });

    it('checks the same permission as the REST endpoints', async () => {
      verifyAsync.mockResolvedValue({ sub: 'user-1' });
      findUnique.mockResolvedValue(activeUser);

      await gateway.authenticate(makeSocket({ auth: { token: 't' } }));

      const context = canActivate.mock.calls[0][0] as {
        getHandler: () => object;
        switchToHttp: () => { getRequest: () => { user: { id: string } } };
      };
      expect(Reflect.getMetadata(PERMISSIONS_KEY, context.getHandler())).toEqual(['settings.edit']);
      expect(context.switchToHttp().getRequest().user.id).toBe('user-1');
    });

    it('accepts a token from auth or a Bearer header and stores the verified user', async () => {
      verifyAsync.mockResolvedValue({ sub: 'user-1', exp: 4_102_444_800 });
      findUnique.mockResolvedValue(activeUser);

      const viaAuth = makeSocket({ auth: { token: 'abc' } });
      await expect(gateway.authenticate(viaAuth)).resolves.toEqual({
        id: 'user-1',
        organizationId: 'org-a',
      });
      expect(verifyAsync).toHaveBeenLastCalledWith('abc');
      expect(viaAuth.data.user).toEqual({ id: 'user-1', organizationId: 'org-a' });
      expect(viaAuth.data.tokenExpiresAt).toBe(4_102_444_800_000);

      const viaHeader = makeSocket({ headers: { authorization: 'Bearer xyz' } });
      await gateway.authenticate(viaHeader);
      expect(verifyAsync).toHaveBeenLastCalledWith('xyz');
    });

    it('ignores any organization the client claims in the handshake', async () => {
      verifyAsync.mockResolvedValue({ sub: 'user-1', organizationId: 'org-evil' });
      findUnique.mockResolvedValue(activeUser);

      const socket = makeSocket({ auth: { token: 't', organizationId: 'org-b' } });
      await gateway.authenticate(socket);
      expect(socket.data.user).toEqual({ id: 'user-1', organizationId: 'org-a' });
    });

    it('afterInit registers a middleware that rejects unauthenticated sockets', async () => {
      const use = jest.fn();
      gateway.afterInit({ use } as unknown as Server);
      const middleware = use.mock.calls[0][0] as (
        socket: Socket,
        next: (err?: Error) => void,
      ) => void;

      const rejected = await new Promise<Error | undefined>((resolve) =>
        middleware(makeSocket(), (err) => resolve(err)),
      );
      expect(rejected?.message).toBe('Unauthorized');

      verifyAsync.mockResolvedValue({ sub: 'user-1' });
      findUnique.mockResolvedValue(activeUser);
      const accepted = await new Promise<Error | undefined>((resolve) =>
        middleware(makeSocket({ auth: { token: 't' } }), (err) => resolve(err)),
      );
      expect(accepted).toBeUndefined();
    });
  });

  describe('connection handling', () => {
    it('puts the socket in its own organization room only', () => {
      const socket = makeSocket();
      socket.data.user = { id: 'user-1', organizationId: 'org-a' };

      gateway.handleConnection(socket);

      expect(socket.join).toHaveBeenCalledTimes(1);
      expect(socket.join).toHaveBeenCalledWith(loggerOrgRoom('org-a'));
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects a socket that somehow skipped authentication', () => {
      const socket = makeSocket();
      gateway.handleConnection(socket);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('disconnects the socket when its token expires', () => {
      jest.useFakeTimers();
      const socket = makeSocket();
      socket.data.user = { id: 'user-1', organizationId: 'org-a' };
      socket.data.tokenExpiresAt = Date.now() + 60_000;

      gateway.handleConnection(socket);
      jest.advanceTimersByTime(59_000);
      expect(socket.disconnect).not.toHaveBeenCalled();
      jest.advanceTimersByTime(2_000);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('clears the expiry timer on disconnect', () => {
      jest.useFakeTimers();
      const socket = makeSocket();
      socket.data.user = { id: 'user-1', organizationId: 'org-a' };
      socket.data.tokenExpiresAt = Date.now() + 60_000;

      gateway.handleConnection(socket);
      gateway.handleDisconnect(socket);
      jest.advanceTimersByTime(120_000);
      expect(socket.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('broadcasts', () => {
    let emit: jest.Mock;
    let to: jest.Mock;

    beforeEach(() => {
      emit = jest.fn();
      to = jest.fn().mockReturnValue({ emit });
      gateway.server = { to } as unknown as Server;
    });

    const entry = (organizationId?: string): LogEntry =>
      ({
        id: 'e1',
        level: LogLevel.ERROR,
        source: LogSource.BACKEND,
        status: LogStatus.OPEN,
        organizationId,
      }) as unknown as LogEntry;

    it("sends new logs only to the entry's organization room", () => {
      gateway.broadcastLog(entry('org-a'));
      expect(to).toHaveBeenCalledWith('org:org-a');
      expect(emit).toHaveBeenCalledWith('new-log', expect.objectContaining({ id: 'e1' }));
    });

    it('never broadcasts system entries (no organization)', () => {
      gateway.broadcastLog(entry(undefined));
      expect(to).not.toHaveBeenCalled();
    });

    it('scopes clear and status events to one organization', () => {
      gateway.broadcastClear('org-a', 3);
      expect(to).toHaveBeenLastCalledWith('org:org-a');
      expect(emit).toHaveBeenLastCalledWith('logs-cleared', { removed: 3 });

      gateway.broadcastStatusUpdate('org-b', ['e1'], 'fixed');
      expect(to).toHaveBeenLastCalledWith('org:org-b');
      expect(emit).toHaveBeenLastCalledWith('status-updated', { ids: ['e1'], status: 'fixed' });

      to.mockClear();
      gateway.broadcastClear('', 1);
      gateway.broadcastStatusUpdate('', [], 'x');
      expect(to).not.toHaveBeenCalled();
    });

    it('never emits to the whole namespace', () => {
      const serverEmit = jest.fn();
      gateway.server = { to, emit: serverEmit } as unknown as Server;
      gateway.broadcastLog(entry('org-a'));
      gateway.broadcastClear('org-a', 1);
      gateway.broadcastStatusUpdate('org-a', [], 'x');
      expect(serverEmit).not.toHaveBeenCalled();
    });
  });
});
