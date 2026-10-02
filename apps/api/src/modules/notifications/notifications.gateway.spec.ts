import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway, notificationsOrgRoom, EntityEvent } from './notifications.gateway';

interface FakeSocket {
  id: string;
  handshake: { auth?: Record<string, unknown>; headers: Record<string, string> };
  data: Record<string, unknown>;
  join: jest.Mock;
  leave: jest.Mock;
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
    leave: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  } as unknown as FakeSocket & Socket;
}

describe('NotificationsGateway', () => {
  let verifyAsync: jest.Mock;
  let findUnique: jest.Mock;
  let gateway: NotificationsGateway;

  beforeEach(() => {
    verifyAsync = jest.fn();
    findUnique = jest.fn();
    gateway = new NotificationsGateway(
      { verifyAsync } as unknown as JwtService,
      { user: { findUnique } } as unknown as PrismaService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const activeUser = {
    id: 'user-1',
    status: 'ACTIVE',
    organizationId: 'org-a',
  };

  describe('handshake authentication', () => {
    it('rejects a handshake without a token', async () => {
      await expect(gateway.authenticate(makeSocket())).rejects.toThrow('missing token');
      expect(verifyAsync).not.toHaveBeenCalled();
    });

    it('rejects an invalid or expired token', async () => {
      verifyAsync.mockRejectedValue(new Error('jwt expired'));
      await expect(
        gateway.authenticate(makeSocket({ auth: { token: 'bad.token.value' } })),
      ).rejects.toThrow('invalid token');
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('does not accept the token from the query string', async () => {
      const socket = makeSocket();
      (socket.handshake as unknown as { query: Record<string, string> }).query = {
        token: 'from-query',
      };
      await expect(gateway.authenticate(socket)).rejects.toThrow('missing token');
      expect(verifyAsync).not.toHaveBeenCalled();
    });

    it('rejects unknown or inactive users', async () => {
      verifyAsync.mockResolvedValue({ sub: 'user-1' });
      findUnique.mockResolvedValue(null);
      await expect(gateway.authenticate(makeSocket({ auth: { token: 't' } }))).rejects.toThrow(
        'inactive user',
      );

      findUnique.mockResolvedValue({ ...activeUser, status: 'SUSPENDED' });
      await expect(gateway.authenticate(makeSocket({ auth: { token: 't' } }))).rejects.toThrow(
        'inactive user',
      );
    });

    it('rejects users without an organizationId', async () => {
      verifyAsync.mockResolvedValue({ sub: 'user-1' });
      findUnique.mockResolvedValue({ id: 'user-1', status: 'ACTIVE', organizationId: null });
      await expect(gateway.authenticate(makeSocket({ auth: { token: 't' } }))).rejects.toThrow(
        'inactive user',
      );
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

      const socket = makeSocket({ auth: { token: 't', organizationId: 'org-evil-client' } });
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
      expect(socket.join).toHaveBeenCalledWith(notificationsOrgRoom('org-a'));
      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(gateway.getOrgConnectionCount('org-a')).toBe(1);
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
      expect(gateway.getOrgConnectionCount('org-a')).toBe(0);
    });
  });

  describe('join-org and leave-org events', () => {
    it('ignores client-supplied org and joins only caller verified org room', () => {
      const socket = makeSocket();
      socket.data.user = { id: 'user-1', organizationId: 'org-a' };

      gateway.handleJoinOrg(socket, 'org-attacker-target');

      expect(socket.join).toHaveBeenCalledWith('org:org-a');
      expect(socket.join).not.toHaveBeenCalledWith('org:org-attacker-target');
      expect(gateway.getOrgConnectionCount('org-a')).toBe(1);
      expect(gateway.getOrgConnectionCount('org-attacker-target')).toBe(0);
    });

    it('disconnects unauthenticated client calling handleJoinOrg', () => {
      const socket = makeSocket();
      gateway.handleJoinOrg(socket, 'org-target');
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('ignores client-supplied org and leaves only caller verified org room', () => {
      const socket = makeSocket();
      socket.data.user = { id: 'user-1', organizationId: 'org-a' };

      gateway.handleConnection(socket);
      expect(gateway.getOrgConnectionCount('org-a')).toBe(1);

      gateway.handleLeaveOrg(socket, 'org-other');
      expect(socket.leave).toHaveBeenCalledWith('org:org-a');
      expect(socket.leave).not.toHaveBeenCalledWith('org:other');
      expect(gateway.getOrgConnectionCount('org-a')).toBe(0);
    });

    it('disconnects unauthenticated client calling handleLeaveOrg', () => {
      const socket = makeSocket();
      gateway.handleLeaveOrg(socket, 'org-target');
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.leave).not.toHaveBeenCalled();
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

    const event: EntityEvent = {
      type: 'CREATED',
      entityType: 'INVOICE',
      entityId: 'inv-1',
      organizationId: 'org-a',
      timestamp: new Date().toISOString(),
    };

    it('sends entity events only to the entity organization room', () => {
      gateway.broadcastEntityEvent(event);
      expect(to).toHaveBeenCalledWith('org:org-a');
      expect(emit).toHaveBeenCalledWith('entity-event', event);
    });

    it('never broadcasts entity events without organizationId', () => {
      gateway.broadcastEntityEvent({ ...event, organizationId: '' });
      expect(to).not.toHaveBeenCalled();
    });

    it('sends notifications only to the target organization room', () => {
      gateway.broadcastNotification('org-b', {
        title: 'Alert',
        message: 'Something happened',
        type: 'INFO',
      });
      expect(to).toHaveBeenCalledWith('org:org-b');
      expect(emit).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({ title: 'Alert', message: 'Something happened' }),
      );
    });

    it('never broadcasts notifications without organizationId', () => {
      gateway.broadcastNotification('', {
        title: 'Alert',
        message: 'Something happened',
        type: 'INFO',
      });
      expect(to).not.toHaveBeenCalled();
    });
  });
});
