/**
 * Test gates (#134). The real-database e2e suites must run in a CI job that goes red when one of
 * them fails, and every way of running the API unit suite must load the same jest config file.
 * These checks read the repository's own workflow and package scripts and ask jest which files
 * and options it would use, so they need no database.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import * as path from 'path';

const apiDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiDir, '..', '..');
const read = (rel: string): string => readFileSync(path.join(repoRoot, rel), 'utf8');
const readJson = <T>(rel: string): T => JSON.parse(read(rel)) as T;

interface PackageJson {
  scripts: Record<string, string>;
  jest?: unknown;
}

interface JestShowConfig {
  configs: Array<Record<string, unknown>>;
}

/** One job of a GitHub workflow: from `  <name>:` up to the next top-level key or comment. */
function workflowJob(workflow: string, name: string): string | undefined {
  const lines = workflow.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  if (start < 0) return undefined;
  const next = lines.findIndex((line, i) => i > start && /^ {2}\S/.test(line));
  return lines.slice(start, next < 0 ? undefined : next).join('\n');
}

/** Runs a command and returns jest's `--showConfig` JSON from its stdout. */
function showConfig(command: string, args: string[]): JestShowConfig {
  const out = execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out.slice(out.indexOf('{'))) as JestShowConfig;
}

const E2E_SUITES = [
  'accountant-journey',
  'accounting',
  'ai',
  'auth',
  'banking',
  'intake',
  'inventory',
  'multi-tenancy',
  'purchases',
  'reports',
  'sales',
];

describe('@issue-134 test gates', () => {
  const ci = read('.github/workflows/ci.yml');
  const e2eJob = workflowJob(ci, 'e2e');

  it('@e2e @flow:test-gate @issue-134 AC1: ci.yml has an e2e job that runs pnpm test:e2e on PostgreSQL', () => {
    expect(e2eJob).toBeDefined();
    const job = e2eJob ?? '';
    expect(job).toMatch(/image: postgres:16/);
    expect(job).toMatch(/prisma migrate deploy/);
    expect(job).toMatch(/DATABASE_URL: postgresql:\/\//);
    expect(job).toMatch(/^\s+run: pnpm test:e2e\s*$/m);
  });

  it('@e2e @flow:test-gate @issue-134 AC1: a failing e2e suite fails the job (nothing masks the exit code)', () => {
    const job = e2eJob ?? '';
    expect(job).not.toMatch(/continue-on-error/);
    expect(job).not.toMatch(/\|\|\s*true/);

    const rootScripts = readJson<PackageJson>('package.json').scripts;
    expect(rootScripts['test:e2e']).toBe('turbo test:e2e');

    const turbo = readJson<{
      tasks: Record<string, { cache?: boolean; passThroughEnv?: string[] }>;
    }>('turbo.json');
    const task = turbo.tasks['test:e2e'];
    expect(task).toBeDefined();
    // Results depend on the database, so a cached pass must never be replayed.
    expect(task.cache).toBe(false);
    expect(task.passThroughEnv).toEqual(expect.arrayContaining(['DATABASE_URL', 'REDIS_URL']));

    const apiE2e = readJson<PackageJson>('apps/api/package.json').scripts['test:e2e'];
    expect(apiE2e).toMatch(/--config \.\/test\/jest-e2e\.json/);
    expect(apiE2e).not.toMatch(/passWithNoTests|\|\|/);
    // Every suite boots a full app on the shared database. In parallel, another suite's intake
    // sweep picks up intake.e2e-spec's jobs with the real extractor and the gate flakes.
    expect(apiE2e).toMatch(/--runInBand/);
  });

  it('@e2e @flow:test-gate @issue-134 AC1: the e2e config collects reports.e2e-spec.ts and every other suite', () => {
    const jestBin = require.resolve('jest/bin/jest', { paths: [apiDir] });
    const listed = execFileSync(
      process.execPath,
      [jestBin, '--config', path.join(apiDir, 'test/jest-e2e.json'), '--listTests'],
      { cwd: apiDir, encoding: 'utf8' },
    )
      .split('\n')
      .map((file) => path.basename(file.trim()));
    for (const suite of E2E_SUITES) expect(listed).toContain(`${suite}.e2e-spec.ts`);
  });

  it('@e2e @flow:test-gate @issue-134 AC2: package.json has no inline jest block and its jest scripts use _jest.config.js', () => {
    const api = readJson<PackageJson>('apps/api/package.json');
    expect(api.jest).toBeUndefined();
    for (const name of ['test', 'test:watch', 'test:cov']) {
      expect(api.scripts[name]).toMatch(/^jest --config _jest\.config\.js\b/);
    }
    expect(read('apps/api/_run_tests.js')).toMatch(/path\.join\(__dirname, '_jest\.config\.js'\)/);
  });

  it('@e2e @flow:test-gate @issue-134 AC2: _run_tests.js and pnpm --filter api test load the same config', () => {
    const viaRunner = showConfig(process.execPath, [
      path.join(apiDir, '_run_tests.js'),
      '--showConfig',
    ]);
    const viaPnpm = showConfig('pnpm', ['--filter', 'api', 'test', '--', '--showConfig']);

    // jest derives the project id from rootDir and the config file path.
    expect(viaPnpm.configs[0].id).toBe(viaRunner.configs[0].id);
    expect(viaPnpm.configs[0]).toEqual(viaRunner.configs[0]);

    // The two settings that used to differ between the runs.
    const config = viaPnpm.configs[0];
    expect(config.setupFilesAfterEnv).toEqual([path.join(apiDir, 'src/test/setup.ts')]);
    expect(config.moduleNameMapper).toEqual(
      expect.arrayContaining([
        ['^sharp$', path.join(apiDir, 'src/test/mocks/sharp.mock.js')],
        ['^tesseract\\.js$', path.join(apiDir, 'src/test/mocks/tesseract.mock.js')],
      ]),
    );
  });
});
