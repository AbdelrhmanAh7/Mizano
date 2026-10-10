import { readFileSync } from 'fs';
import { workerHeartbeatHealthy } from './intake-worker-healthcheck';

jest.mock('fs', () => ({ readFileSync: jest.fn() }));

describe('worker readiness heartbeat', () => {
  it('accepts a recent successful dependency probe', () => {
    jest.mocked(readFileSync).mockReturnValue(String(Date.now() - 1000));
    expect(workerHeartbeatHealthy()).toBe(true);
  });
  it.each(['stale', 'invalid', 'future'])('rejects %s heartbeats', (kind) => {
    jest
      .mocked(readFileSync)
      .mockReturnValue(
        kind === 'invalid' ? 'invalid' : String(Date.now() + (kind === 'future' ? 100000 : -30000)),
      );
    expect(workerHeartbeatHealthy()).toBe(false);
  });
  it('rejects missing heartbeat files', () => {
    jest.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(workerHeartbeatHealthy()).toBe(false);
  });
});
