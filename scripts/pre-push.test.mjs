import test from 'node:test';
import assert from 'node:assert/strict';
import { runWithWatchdog, parsePushLines, refsToTest, baseFor, turboFilter, headMismatch } from './pre-push-lib.mjs';

const Z = '0'.repeat(40);
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), D = 'd'.repeat(40);
const git = (known = []) => ({ hasCommit: (s) => known.includes(s), mergeBase: (x, y) => `mb(${x},${y})` });

test('parse: one entry per line, ignores blanks', () => {
  const e = parsePushLines(`refs/heads/x ${A} refs/heads/x ${B}\n\nrefs/heads/y ${C} refs/heads/y ${Z}\n`);
  assert.equal(e.length, 2);
  assert.deepEqual(e[0], { localRef: 'refs/heads/x', localSha: A, remoteRef: 'refs/heads/x', remoteSha: B });
  assert.deepEqual(parsePushLines(''), []);
});

test('delete ref (local sha zeros) is skipped', () => {
  const e = parsePushLines(`(delete) ${Z} refs/heads/old ${B}\n`);
  assert.deepEqual(refsToTest(e), []);
});

test('existing remote ref: base is remote sha', () => {
  const [e] = parsePushLines(`refs/heads/x ${A} refs/heads/x ${B}`);
  assert.equal(baseFor(e, git([B])), B);
  assert.equal(turboFilter(B, A), `...[${B}...${A}]`);
});

test('new branch (remote sha zeros): base is merge-base with origin/master', () => {
  const [e] = parsePushLines(`refs/heads/x ${A} refs/heads/x ${Z}`);
  assert.equal(baseFor(e, git()), `mb(origin/master,${A})`);
});

test('remote sha unknown locally falls back to merge-base', () => {
  const [e] = parsePushLines(`refs/heads/x ${A} refs/heads/x ${B}`);
  assert.equal(baseFor(e, git([])), `mb(origin/master,${A})`);
});

test('multi-ref: every non-deleted ref is tested, duplicate shas once', () => {
  const e = parsePushLines(
    [`refs/heads/x ${A} refs/heads/x ${B}`, `refs/heads/y ${A} refs/heads/y ${C}`,
     `refs/heads/z ${D} refs/heads/z ${Z}`, `(delete) ${Z} refs/heads/q ${C}`].join('\n'));
  assert.deepEqual(refsToTest(e).map((r) => r.localSha), [A, D]);
});

test('non-HEAD sha is rejected with a checkout hint; HEAD sha passes', () => {
  const [e] = parsePushLines(`refs/heads/feature ${A} refs/heads/feature ${B}`);
  assert.equal(headMismatch(e, A), null);
  const msg = headMismatch(e, C);
  assert.match(msg, /not the checked-out HEAD/);
  assert.match(msg, /Check out 'feature'/);
});

test('watchdog kills a hung task and its children, returns 1', async () => {
  const t0 = Date.now();
  // the shell spawns a child sleep; killing the process group must end both
  const code = await runWithWatchdog('sh', ['-c', 'sleep 30 & sleep 30; wait'], 300);
  assert.equal(code, 1);
  assert.ok(Date.now() - t0 < 5000);
});

test('watchdog forwards the exit code of a finished task', async () => {
  assert.equal(await runWithWatchdog('sh', ['-c', 'exit 0'], 5000), 0);
  assert.equal(await runWithWatchdog('sh', ['-c', 'exit 3'], 5000), 3);
});
