import { spawnSync, SpawnSyncReturns } from 'child_process';
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
    it.each(['128', '512', '4096'])(
      '@e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=%s and caps heap',
      (heapMb) => {
        const res = runStartNode({ MIZANO_NODE_HEAP_MB: heapMb }, inlineProbe);
        expect(res.status).toBe(0);
        const parsed = JSON.parse(res.stdout.trim());
        expect(parsed.execArgv).toContain(`--max-old-space-size=${heapMb}`);
      },
    );

    it.each([
      { input: '128', expected: 128 },
      { input: '512', expected: 512 },
      { input: '4096', expected: 4096 },
    ])(
      '@unit @flow:node-heap @issue-127 AC2: parseHeapMb parses %s and buildNodeArgs prepends argument',
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
    const invalidValues = ['127', '4097', 'abc', '1.5', '', '0', '-1'];

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
});
