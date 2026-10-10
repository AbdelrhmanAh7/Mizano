import { execFile } from 'child_process';
import { IntakeFormatError } from './format-error';

/** Fixed executable/argv only; no shell, secret inheritance, or raw diagnostics. */
export function runFormatTool(executable: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const tool = process.platform === 'linux' ? 'prlimit' : executable;
    const argv =
      process.platform === 'linux'
        ? ['--as=1073741824', '--cpu=30', '--fsize=33554432', '--', executable, ...args]
        : args;
    execFile(
      tool,
      argv,
      {
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, LANG: 'C.UTF-8' },
      },
      (error, stdout, stderr) => {
        // Poppler can return success after recovering a broken file. Never
        // accept partial extraction when the parser reported damaged content.
        if (!error) {
          if (/syntax (?:error|warning)|(?:error|warning):/i.test(stderr)) {
            return reject(new IntakeFormatError('CORRUPT'));
          }
          return resolve(stdout);
        }
        const code = (error as NodeJS.ErrnoException).code;
        reject(
          new IntakeFormatError(
            code === 'ENOENT' || /operation not permitted|failed to execute/i.test(stderr)
              ? 'TOOL_UNAVAILABLE'
              : /password|encrypted/i.test(stderr)
                ? 'ENCRYPTED'
                : code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ||
                    error.killed ||
                    error.signal === 'SIGXFSZ' ||
                    error.signal === 'SIGXCPU'
                  ? 'TOO_LARGE'
                  : 'CORRUPT',
          ),
        );
      },
    );
  });
}
