#!/usr/bin/env node
// Fast pre-push gate: type-check + unit tests of the packages affected by the refs being pushed,
// with a hard 290 s watchdog (owner rule: no hook over 5 min). Full CI runs through the hub's localci.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { BUDGET_MS, runWithWatchdog, parsePushLines, refsToTest, baseFor, turboFilter, headMismatch } from './pre-push-lib.mjs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const gitApi = {
  hasCommit: (sha) => {
    try { git('cat-file', '-e', `${sha}^{commit}`); return true; } catch { return false; }
  },
  mergeBase: (a, b) => git('merge-base', a, b),
};

async function main() {
  const entries = refsToTest(parsePushLines(readFileSync(0, 'utf8')));
  if (entries.length === 0) return 0; // nothing to test (e.g. only deletions)
  const head = git('rev-parse', 'HEAD');
  for (const e of entries) {
    const err = headMismatch(e, head);
    if (err) { console.error(err); return 1; }
  }
  const start = Date.now();
  for (const e of entries) {
    const remaining = BUDGET_MS - (Date.now() - start);
    if (remaining <= 0) { console.error(`pre-push budget exceeded (${BUDGET_MS / 1000} s)`); return 1; }
    const filter = turboFilter(baseFor(e, gitApi), e.localSha);
    console.log(`pre-push: type-check + test --filter='${filter}'`);
    const code = await runWithWatchdog('pnpm', ['exec', 'turbo', 'type-check', 'test', `--filter=${filter}`], remaining);
    if (code !== 0) return code;
  }
  return 0;
}

main().then((c) => process.exit(c), (e) => { console.error(`pre-push: ${e.message}`); process.exit(1); });
