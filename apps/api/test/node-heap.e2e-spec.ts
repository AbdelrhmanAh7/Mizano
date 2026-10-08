import { spawn, spawnSync, SpawnSyncReturns } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface NodeHeapModule {
  parseHeapMb: (env?: NodeJS.ProcessEnv) => number | undefined;
  buildNodeArgs: (env?: NodeJS.ProcessEnv, args?: string[]) => string[];
}

const startNodeScriptPath = path.resolve(__dirname, '../scripts/start-node.js');
const nodeHeapModulePath = path.resolve(__dirname, '../scripts/node-heap.js');
const rootDir = path.resolve(__dirname, '../../..');

const runStartNode = (
  envOverrides: Record<string, string | undefined>,
  scriptArgs: string[],
): SpawnSyncReturns<string> => {
  const env = { ...process.env };
  delete env.MIZANO_NODE_HEAP_MB;
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }

  return spawnSync(process.execPath, [startNodeScriptPath, ...scriptArgs], {
    env,
    encoding: 'utf-8',
  });
};

const loadNodeHeapModule = (): NodeHeapModule | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- require() needed to load CommonJS module before build step
    return require(nodeHeapModulePath);
  } catch {
    return null;
  }
};

describe('Node Heap Launcher (@flow:node-heap @issue-127)', () => {
  const inlineProbe = [
    '-e',
    'const v8 = require("v8"); console.log(JSON.stringify({ heapLimit: v8.getHeapStatistics().heap_size_limit, execArgv: process.execArgv }));',
  ];

  describe('@issue-127 AC1: Unset heap cap behavior', () => {
    it('@e2e @flow:node-heap @issue-127 AC1: launches node without --max-old-space-size when unset', () => {
      const res = runStartNode({}, inlineProbe);
      expect(res.status).toBe(0);
      const parsed = JSON.parse(res.stdout.trim());
      expect(parsed.execArgv.some((arg: string) => arg.includes('--max-old-space-size'))).toBe(
        false,
      );
    });

    it('@unit @flow:node-heap @issue-127 AC1: parseHeapMb returns undefined and buildNodeArgs adds no flag when unset', () => {
      const mod = loadNodeHeapModule();
      expect(mod).not.toBeNull();
      expect(mod?.parseHeapMb({})).toBeUndefined();
      expect(mod?.buildNodeArgs({}, ['dist/main'])).toEqual(['dist/main']);
    });
  });

  describe('@issue-127 AC2: Valid heap cap configurations', () => {
    it.each([
      { input: '128', expectedMb: 128 },
      { input: '512', expectedMb: 512 },
      { input: '4096', expectedMb: 4096 },
      { input: '0x80', expectedMb: 128 },
    ])(
      '@e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=$expectedMb for input $input and caps heap',
      ({ input, expectedMb }) => {
        const res = runStartNode({ MIZANO_NODE_HEAP_MB: input }, inlineProbe);
        expect(res.status).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.execArgv).toContain(`--max-old-space-size=${expectedMb}`);
      },
    );

    it.each([
      { input: '128', expected: 128 },
      { input: '512', expected: 512 },
      { input: '4096', expected: 4096 },
      { input: '0x80', expected: 128 },
    ])(
      '@unit @flow:node-heap @issue-127 AC2: parseHeapMb parses $input as $expected and buildNodeArgs prepends argument',
      ({ input, expected }) => {
        const mod = loadNodeHeapModule();
        expect(mod).not.toBeNull();
        expect(mod?.parseHeapMb({ MIZANO_NODE_HEAP_MB: input })).toBe(expected);
        expect(mod?.buildNodeArgs({ MIZANO_NODE_HEAP_MB: input }, ['dist/main'])).toEqual([
          `--max-old-space-size=${expected}`,
          'dist/main',
        ]);
      },
    );
  });

  describe('@issue-127 AC3: Invalid heap cap values fail fast', () => {
    const invalidValues = ['127', '4097', 'abc', '1.5', '128.5', '', '0', '-1', '0x7f', '0x1001'];

    it.each(invalidValues)(
      '@e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is %s',
      (invalidValue) => {
        const res = runStartNode({ MIZANO_NODE_HEAP_MB: invalidValue }, inlineProbe);
        expect(res.status).not.toBe(0);
        expect(res.stderr).toContain('MIZANO_NODE_HEAP_MB');
      },
    );

    it.each(invalidValues)(
      '@unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for %s',
      (invalidValue) => {
        const mod = loadNodeHeapModule();
        expect(mod).not.toBeNull();
        expect(() => mod?.parseHeapMb({ MIZANO_NODE_HEAP_MB: invalidValue })).toThrow(
          /MIZANO_NODE_HEAP_MB/,
        );
      },
    );

    it('@flow:node-heap @issue-127: does not interpolate raw value into error message', () => {
      const secret = 'super-secret-token-123';
      const res = runStartNode({ MIZANO_NODE_HEAP_MB: secret }, inlineProbe);
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain('MIZANO_NODE_HEAP_MB');
      expect(res.stderr).not.toContain(secret);

      const mod = loadNodeHeapModule();
      expect(() => mod?.parseHeapMb({ MIZANO_NODE_HEAP_MB: secret })).toThrow(
        /^MIZANO_NODE_HEAP_MB must be an integer between 128 and 4096$/,
      );
    });
  });

  describe('@issue-127 AC4: Documentation', () => {
    it('@flow:node-heap @issue-127 AC4: documents MIZANO_NODE_HEAP_MB in .env.example', () => {
      const envExamplePath = path.resolve(rootDir, '.env.example');
      expect(fs.existsSync(envExamplePath)).toBe(true);
      const content = fs.readFileSync(envExamplePath, 'utf-8');
      expect(content).toContain('MIZANO_NODE_HEAP_MB');
    });

    it('@flow:node-heap @issue-127 AC4: documents MIZANO_NODE_HEAP_MB in README.md', () => {
      const readmePath = path.resolve(rootDir, 'README.md');
      const content = fs.readFileSync(readmePath, 'utf-8');
      expect(content).toContain('MIZANO_NODE_HEAP_MB');
    });
  });

  describe('@issue-127 AC5: Signal forwarding to child process', () => {
    it('@e2e @flow:node-heap @issue-127: forwards SIGTERM to the child and exits non-zero or by signal', async () => {
      const probe = [
        '-e',
        'console.log("CHILD_READY"); process.on("SIGTERM", () => { console.log("CHILD_RECEIVED_SIGTERM"); process.exit(42); }); setInterval(() => {}, 1000);',
      ];
      const env = { ...process.env };
      delete env.MIZANO_NODE_HEAP_MB;

      const child = spawn(process.execPath, [startNodeScriptPath, ...probe], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (!child.stdout) {
        child.kill('SIGTERM');
        throw new Error('Failed to capture launcher stdout');
      }

      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      const waitForMarker = (marker: string) =>
        new Promise<void>((resolve, reject) => {
          let timer: NodeJS.Timeout | null = null;
          const cleanup = () => {
            if (timer) clearTimeout(timer);
            child.stdout?.off('data', onData);
            child.off('exit', onExit);
            child.off('error', onError);
          };
          const onData = () => {
            if (stdout.includes(marker)) {
              cleanup();
              resolve();
            }
          };
          const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
            cleanup();
            reject(
              new Error(
                `Child exited unexpectedly before ${marker} (code=${code}, signal=${signal})`,
              ),
            );
          };
          const onError = (err: Error) => {
            cleanup();
            reject(err);
          };
          timer = setTimeout(() => {
            cleanup();
            reject(new Error(`Timed out waiting for ${marker} in child output`));
          }, 15000);
          child.stdout?.on('data', onData);
          child.once('exit', onExit);
          child.once('error', onError);
        });

      await waitForMarker('CHILD_READY');
      child.kill('SIGTERM');

      const [exitCode, exitSignal] = await new Promise<[number | null, NodeJS.Signals | null]>(
        (resolve) => {
          child.on('exit', (code, signal) => resolve([code, signal]));
        },
      );

      expect(stdout).toContain('CHILD_RECEIVED_SIGTERM');
      expect(exitCode).toBe(42);
      expect(exitSignal).toBeNull();
    });

    it('@e2e @flow:node-heap @issue-127: forwards subsequent signals while child is still running', async () => {
      const probe = [
        '-e',
        'console.log("CHILD_READY"); process.on("SIGTERM", () => { console.log("CHILD_IGNORED_SIGTERM"); }); process.on("SIGINT", () => { console.log("CHILD_CAUGHT_SIGINT"); process.exit(43); }); setInterval(() => {}, 1000);',
      ];
      const env = { ...process.env };
      delete env.MIZANO_NODE_HEAP_MB;

      const child = spawn(process.execPath, [startNodeScriptPath, ...probe], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (!child.stdout) {
        child.kill('SIGKILL');
        throw new Error('Failed to capture launcher stdout');
      }

      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      const waitForMarker = (marker: string) =>
        new Promise<void>((resolve, reject) => {
          let timer: NodeJS.Timeout | null = null;
          const cleanup = () => {
            if (timer) clearTimeout(timer);
            child.stdout?.off('data', onData);
            child.off('exit', onExit);
            child.off('error', onError);
          };
          const onData = () => {
            if (stdout.includes(marker)) {
              cleanup();
              resolve();
            }
          };
          const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
            cleanup();
            reject(
              new Error(
                `Child exited unexpectedly before ${marker} (code=${code}, signal=${signal})`,
              ),
            );
          };
          const onError = (err: Error) => {
            cleanup();
            reject(err);
          };
          timer = setTimeout(() => {
            cleanup();
            reject(new Error(`Timed out waiting for ${marker} in child output`));
          }, 15000);
          child.stdout?.on('data', onData);
          child.once('exit', onExit);
          child.once('error', onError);
        });

      await waitForMarker('CHILD_READY');
      child.kill('SIGTERM');
      await waitForMarker('CHILD_IGNORED_SIGTERM');
      child.kill('SIGINT');

      const [exitCode, exitSignal] = await new Promise<[number | null, NodeJS.Signals | null]>(
        (resolve) => {
          child.on('exit', (code, signal) => resolve([code, signal]));
        },
      );

      expect(stdout).toContain('CHILD_CAUGHT_SIGINT');
      expect(exitCode).toBe(43);
      expect(exitSignal).toBeNull();
    });
  });
});
