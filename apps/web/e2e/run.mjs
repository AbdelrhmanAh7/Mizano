import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { browserEnvironment, requireBrowserExecutable } from './environment.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const env = browserEnvironment();
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const requireWeb = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = requireWeb('@playwright/test');
try {
  requireBrowserExecutable(chromium.executablePath(), process.env.MIZANO_BROWSER_CHANNEL);
  const browser = await chromium.launch({ channel: process.env.MIZANO_BROWSER_CHANNEL });
  process.stdout.write(`Browser version: ${browser.version()}\n`);
  await browser.close();
} catch (error) {
  // Browser launch errors can contain inherited paths or launch environment details.
  process.stderr.write(
    error.message.startsWith('Chromium is missing') ||
      error.message === 'Unsupported browser channel'
      ? `${error.message}\n`
      : 'Browser preflight failed; provision the selected browser before running this gate\n',
  );
  process.exit(1);
}

// Create only this lane's database when absent; never reset/drop an existing database.
const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const { PrismaClient } = requireApi('@prisma/client');
const adminURL = new URL(env.DATABASE_URL);
adminURL.pathname = '/postgres';
const admin = new PrismaClient({ datasources: { db: { url: adminURL.toString() } } });
try {
  const exists =
    await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname = 'mizano_e2e_cxe2e'`;
  if (exists.length === 0) await admin.$executeRawUnsafe('CREATE DATABASE mizano_e2e_cxe2e');
} catch {
  process.stderr.write(
    'Browser database preflight failed; check the isolated PostgreSQL service and role permissions\n',
  );
  process.exitCode = 1;
} finally {
  await admin.$disconnect();
}
if (process.exitCode) process.exit(process.exitCode);

function run(args) {
  // Only fixed commands/argv are run. No caller-provided shell command or credentials.
  const result = spawnSync(pnpm, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw new Error('Unable to start pnpm for the browser gate');
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['--filter', 'api', 'exec', 'prisma', 'migrate', 'deploy']);
// Serialize expensive builds; production web embeds the isolated API URL above.
run(['--filter', 'api', 'build']);
run(['--filter', '@mizano/web', 'build']);
run([
  '--filter',
  '@mizano/web',
  'exec',
  'playwright',
  'test',
  '--config',
  'e2e/playwright.config.mjs',
]);
