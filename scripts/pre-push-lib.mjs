import { spawn } from 'node:child_process';

// Pure helpers for the pre-push hook (scripts/pre-push.mjs). No I/O here so they are unit-testable.
export const ZERO_SHA = /^0+$/;
export const BUDGET_MS = 290_000;

/** Parse git's pre-push stdin: "<local_ref> <local_sha> <remote_ref> <remote_sha>" per line. */
export function parsePushLines(text) {
  return String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [localRef, localSha, remoteRef, remoteSha] = l.split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    })
    .filter((e) => e.localSha && e.remoteSha);
}

/** Refs that carry commits: drop deletions (local sha all zeros) and duplicate local shas. */
export function refsToTest(entries) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    if (ZERO_SHA.test(e.localSha) || seen.has(e.localSha)) continue;
    seen.add(e.localSha);
    out.push(e);
  }
  return out;
}

/**
 * Base commit to diff against: the remote sha for an existing remote ref, otherwise (new branch, or the
 * remote sha is unknown locally) the merge-base with origin/master.
 * @param {{remoteSha:string,localSha:string}} entry
 * @param {{hasCommit:(sha:string)=>boolean, mergeBase:(a:string,b:string)=>string}} git
 */
export function baseFor(entry, git) {
  if (!ZERO_SHA.test(entry.remoteSha) && git.hasCommit(entry.remoteSha)) return entry.remoteSha;
  return git.mergeBase('origin/master', entry.localSha);
}

export function turboFilter(base, localSha) {
  return `...[${base}...${localSha}]`;
}

/** The checked-out tree is what turbo tests, so every pushed sha must equal HEAD. Returns an error or null. */
export function headMismatch(entry, headSha) {
  if (entry.localSha === headSha) return null;
  const name = entry.localRef.replace(/^refs\/heads\//, '');
  return `pre-push: ${entry.localRef} (${entry.localSha.slice(0, 9)}) is not the checked-out HEAD (${headSha.slice(0, 9)}). ` +
    `Check out '${name}' and push again so the tested tree is the pushed one.`;
}

/**
 * Run a command in its own process group; SIGKILL the whole group when `ms` elapse.
 * Resolves with the exit code (1 on timeout, after printing 'pre-push budget exceeded').
 */
export function runWithWatchdog(cmd, args, ms) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', detached: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
    }, ms);
    child.on('error', (e) => { clearTimeout(timer); console.error(`pre-push: ${e.message}`); resolve(1); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        console.error(`pre-push budget exceeded (${BUDGET_MS / 1000} s): tests killed. Push blocked.`);
        resolve(1);
      } else {
        resolve(code ?? (signal ? 1 : 0));
      }
    });
  });
}
