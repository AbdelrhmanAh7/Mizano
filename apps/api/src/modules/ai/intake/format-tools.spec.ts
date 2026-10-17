import { execFile, ExecFileException } from 'child_process';
import { runFormatTool } from './format-tools';

jest.mock('child_process', () => ({ execFile: jest.fn() }));

describe('bounded CPU format processes', () => {
  beforeEach(() => jest.mocked(execFile).mockReset());
  function finish(error: ExecFileException | null, stdout = '', stderr = ''): void {
    const callback = jest.mocked(execFile).mock.calls[0][3] as unknown as (
      error: ExecFileException | null,
      stdout: string,
      stderr: string,
    ) => void;
    callback(error, stdout, stderr);
  }
  it('uses fixed argv, a timeout and output cap, without inheriting credentials', async () => {
    const result = runFormatTool('pdfinfo', ['/private/source.pdf']);
    const [tool, args, options] = jest.mocked(execFile).mock.calls[0];
    expect(tool).toBe(process.platform === 'linux' ? 'prlimit' : 'pdfinfo');
    expect(args).toEqual(
      process.platform === 'linux'
        ? [
            '--as=1073741824',
            '--cpu=30',
            '--fsize=33554432',
            '--',
            'pdfinfo',
            '/private/source.pdf',
          ]
        : ['/private/source.pdf'],
    );
    expect(options).toMatchObject({ timeout: 30000, maxBuffer: 2097152, windowsHide: true });
    expect(options).not.toHaveProperty('shell');
    expect(Object.keys((options as { env: NodeJS.ProcessEnv }).env)).toEqual([
      'PATH',
      'SystemRoot',
      'LANG',
    ]);
    finish(null, 'Pages: 2');
    await expect(result).resolves.toBe('Pages: 2');
  });
  it('rejects recovered parser damage even with a zero exit code, without exposing diagnostics', async () => {
    const result = runFormatTool('pdftotext', ['/private/source.pdf', '-']);
    const check = expect(result).rejects.toThrow('INTAKE_CORRUPT');
    finish(null, 'partial document', 'Syntax Warning: DOCUMENT-SECRET');
    await check;
  });
  it.each([
    [{ code: 'ENOENT' }, '', 'TOOL_UNAVAILABLE'],
    [{ code: 1 }, 'prlimit: failed to execute pdfinfo: No such file', 'TOOL_UNAVAILABLE'],
    [{ code: 1 }, 'Incorrect password', 'ENCRYPTED'],
    [{ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }, '', 'TOO_LARGE'],
    [{ killed: true }, '', 'TOO_LARGE'],
    [{ signal: 'SIGXFSZ' }, '', 'TOO_LARGE'],
    [{ code: 1 }, 'parser failed with DOCUMENT-SECRET', 'CORRUPT'],
  ])('returns safe localized error for %j', async (details, stderr, code) => {
    const result = runFormatTool('pdfinfo', ['/private/source.pdf']);
    const check = expect(result).rejects.toThrow(`INTAKE_${code}`);
    finish(Object.assign(new Error('DOCUMENT-SECRET'), details) as ExecFileException, '', stderr);
    await check;
  });
});
