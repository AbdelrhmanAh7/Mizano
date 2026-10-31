import type { Socket } from 'socket.io';
import { extractSocketToken, SocketExpiryTimers } from './socket-auth';

const socket = (overrides: Record<string, unknown>) =>
  ({ id: 's1', handshake: {}, data: {}, disconnect: jest.fn(), ...overrides }) as unknown as Socket;

describe('socket-auth helpers (logger and notifications gateways)', () => {
  afterEach(() => jest.useRealTimers());

  it('reads the token from handshake auth first, then a Bearer header, else none', () => {
    expect(extractSocketToken(socket({ handshake: { auth: { token: 'a' } } }))).toBe('a');
    expect(
      extractSocketToken(socket({ handshake: { headers: { authorization: 'Bearer b' } } })),
    ).toBe('b');
    expect(
      extractSocketToken(socket({ handshake: { headers: { authorization: 'Basic c' } } })),
    ).toBe(undefined);
    expect(extractSocketToken(socket({ handshake: { auth: { token: '' } } }))).toBe(undefined);
  });

  it('disconnects a socket when its token expires, and not after clear', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-31T10:00:00Z'));
    const timers = new SocketExpiryTimers();
    const expiring = socket({ id: 'x', data: { tokenExpiresAt: Date.now() + 1000 } });
    const cleared = socket({ id: 'y', data: { tokenExpiresAt: Date.now() + 1000 } });
    timers.schedule(expiring);
    timers.schedule(cleared);
    timers.clear('y');
    jest.advanceTimersByTime(1000);
    expect(expiring.disconnect).toHaveBeenCalledWith(true);
    expect(cleared.disconnect).not.toHaveBeenCalled();
  });
});
