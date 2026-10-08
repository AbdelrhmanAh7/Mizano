// tester-army/e2e (npm `e2e`, Apache-2.0) config of Mizano's in-repo E2E gate (#153). Tests live in e2e-army/:
//   e2e-army/<issue>-<flow>.e2e.ts   a PR's own tests (self-contained; the hub's verify job copies these next to its suite)
//   e2e-army/features/*.e2e.ts       the feature suite, tagged feat:<feature> · shard:<shard> · lvl:ui|api|job (shards: e2e-army/shards.json)
// `pnpm e2e:army` (scripts/e2e-army.sh) brings up the API + web on a test database first. Everything is read from the environment,
// nothing secret lives in the repository:
//   E2E_ARMY_URL  web base URL (default http://127.0.0.1:5001)    E2E_ARMY_API  Nest API base (default http://127.0.0.1:6001/api)
//   E2E_ARMY_OUT  results directory (default .e2e)
// Model for the natural-language agent steps, first match wins:
//   E2E_ARMY_MODEL_URL + E2E_ARMY_MODEL_ID  OpenAI-compatible endpoint (e.g. a free vision + tools model); key from E2E_ARMY_MODEL_KEY
//                                           or, on macOS, the Keychain item `e2e-army-model-key`
//   E2E_ARMY_CLI=agy|claude                 subscription CLI adapter (e2e-army/cli-model.ts): Gemini Flash via agy (free) or Claude Haiku
//   none                                    E2E_ARMY_NOAGENT=1: agent tests skip themselves, locator and request-level tests still run
// Headless browser (engine default), replay cache read-write under .e2e/cache (also in CI), telemetry off.
import { execFileSync } from 'node:child_process';
import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

process.env.E2E_TELEMETRY_DISABLED = '1';
process.env.DO_NOT_TRACK = '1';

const WEB = (process.env.E2E_ARMY_URL ?? 'http://127.0.0.1:5001').replace(/\/+$/, '');
process.env.E2E_ARMY_URL = WEB;
process.env.E2E_ARMY_API ??= 'http://127.0.0.1:6001/api';

function keychain(service: string): string | undefined {
  if (process.platform !== 'darwin') return undefined;
  try {
    return (
      execFileSync('/usr/bin/security', ['find-generic-password', '-s', service, '-w'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

async function agentModel(): Promise<unknown> {
  const { E2E_ARMY_MODEL_URL: url, E2E_ARMY_MODEL_ID: id, E2E_ARMY_CLI: cli } = process.env;
  if (url && id) {
    const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
    const apiKey = process.env.E2E_ARMY_MODEL_KEY ?? keychain('e2e-army-model-key');
    return createOpenAICompatible({ name: 'army', baseURL: url, apiKey }).chatModel(id);
  }
  if (cli === 'agy' || cli === 'claude') {
    const { cliModel } = await import('./e2e-army/cli-model.ts');
    return cliModel({ cli });
  }
  return undefined;
}

const model = await agentModel();
if (!model) process.env.E2E_ARMY_NOAGENT = '1';

export default {
  tests: ['e2e-army/**/*.e2e.ts'],
  // identity = the hub's (`nql-<repo>`), so replay-cache entries recorded there replay here whatever the port
  targets: [{ engine: web(), app: { url: WEB, identity: 'nql-Mizano' } }],
  output: process.env.E2E_ARMY_OUT ?? '.e2e',
  workers: 1,
  retries: 0,
  timeout: 150_000,
  cache: 'read-write',
  ...(model
    ? {
        agents: {
          default: {
            model: model as never,
            maxModelCalls: 14,
            maxSteps: 14,
            judgmentTimeout: 90_000,
          },
        },
      }
    : {}),
} satisfies E2EConfig;
