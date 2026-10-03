import { EventEmitter } from 'events';
import type { ClientRequest, IncomingMessage } from 'http';
import { probeApiHealth } from './healthcheck';

const get = jest.fn();
jest.mock('http', () => ({
  get: (...args: unknown[]): unknown => get(...args),
}));

describe('container API health probe', () => {
  let request: EventEmitter & { destroy: jest.Mock };
  let response: EventEmitter & {
    statusCode: number;
    setEncoding: jest.Mock;
    resume: jest.Mock;
    destroy: jest.Mock;
  };
  let receive: (response: IncomingMessage) => void;

  beforeEach(() => {
    jest.useFakeTimers();
    request = Object.assign(new EventEmitter(), { destroy: jest.fn() });
    response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      setEncoding: jest.fn(),
      resume: jest.fn(),
      destroy: jest.fn(),
    });
    get.mockReset().mockImplementation((_url: string, callback: typeof receive): ClientRequest => {
      receive = callback;
      return request as unknown as ClientRequest;
    });
  });

  afterEach(() => jest.useRealTimers());

  it.each([
    ['{"status":"healthy"}', true],
    ['{"status":"unhealthy"}', false],
    ['{"ready":true}', false],
    ['null', false],
    ['invalid-json', false],
  ])('checks the response body %s', async (body, healthy) => {
    const result = probeApiHealth();
    receive(response as unknown as IncomingMessage);
    response.emit('data', body);
    response.emit('end');
    expect(await result).toBe(healthy);
    expect(get).toHaveBeenCalledWith('http://127.0.0.1:6001/api/health', expect.any(Function));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects a nonexistent or unsuccessful route', async () => {
    response.statusCode = 404;
    const result = probeApiHealth();
    receive(response as unknown as IncomingMessage);
    expect(await result).toBe(false);
    expect(response.destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects connection errors', async () => {
    const result = probeApiHealth();
    request.emit('error', new Error('synthetic connection failure'));
    expect(await result).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects an aborted response', async () => {
    const result = probeApiHealth();
    receive(response as unknown as IncomingMessage);
    response.emit('aborted');
    expect(await result).toBe(false);
  });

  it('enforces a total deadline even while data continues arriving', async () => {
    const result = probeApiHealth();
    receive(response as unknown as IncomingMessage);
    jest.advanceTimersByTime(4000);
    response.emit('data', '{');
    jest.advanceTimersByTime(1000);
    expect(await result).toBe(false);
    expect(request.destroy).toHaveBeenCalledTimes(1);
  });

  it('bounds the response body', async () => {
    const result = probeApiHealth();
    receive(response as unknown as IncomingMessage);
    response.emit('data', 'x'.repeat(16385));
    expect(await result).toBe(false);
    expect(response.destroy).toHaveBeenCalledTimes(1);
  });
});
