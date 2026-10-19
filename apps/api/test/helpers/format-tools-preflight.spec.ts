import { execFile } from 'child_process';
import { preflightFormatTools } from './format-tools-preflight.helper';

jest.mock('child_process', () => ({ execFile: jest.fn() }));

describe('CPU format E2E preflight', () => {
  beforeEach(() => jest.mocked(execFile).mockReset());
  function mockTools(missing: string[]): void {
    jest.mocked(execFile).mockImplementation(((
      tool: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null) => void,
    ) => {
      callback(missing.includes(tool) ? new Error('unavailable') : null);
    }) as unknown as typeof execFile);
  }
  it('runs all five version commands once and reports every unavailable tool in one error', async () => {
    mockTools(['pdfinfo', 'pdftotext', 'prlimit']);
    await expect(preflightFormatTools()).rejects.toThrow(
      'Missing or unusable tools: pdfinfo, pdftotext, prlimit.',
    );
    expect(jest.mocked(execFile).mock.calls.map((call) => call.slice(0, 2))).toEqual([
      ['pdfinfo', ['-v']],
      ['pdfimages', ['-v']],
      ['pdftotext', ['-v']],
      ['pdftoppm', ['-v']],
      ['prlimit', ['--version']],
    ]);
  });
  it('accepts a host with every required tool', async () => {
    mockTools([]);
    await expect(preflightFormatTools()).resolves.toBeUndefined();
    expect(execFile).toHaveBeenCalledTimes(5);
  });
});
