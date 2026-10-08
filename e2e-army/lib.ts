// Shared helpers of the e2e-army feature suite (e2e-army/features/), ported verbatim from the hub (nql-agents ops/verify/e2e-army/tests-dev/lib.ts, #153).
//
// TEST CONVENTION (src/lib/featurecov.ts reads it; `node src/lib/featurecov.ts check <Repo>` validates it):
//   test("[<feature>.<n>] <what is verified>", { tags: ["feat:<feature>", "shard:<shard>", "lvl:ui|api|job"] }, async ({ app, … }) => { … });
//   - <feature> = id in ops/verify/features/<Repo>.json, <n> = 1,2,3… unique per feature; one feature may have ui + api + job tests.
//   - lvl:ui  = browser, natural-language agent steps (replay-cached) + exact expects;  lvl:api = request-level (fetch against app.baseUrl / apiBase(), no model);
//     lvl:job = trigger the job/worker (endpoint, queue, webhook …) and assert its observable result.
//   - shard:<shard> = a group of features that runs in ≤ 5 min (ops/verify/e2e-army/<Repo>.json shards[]; ui shard ≈ ≤ 6 agent tests, api shard ≈ ≤ 40 requests).
//   - no sleeps, no Date.now()/Math.random() in test data: use seeded()/seededEmail() so a re-run on an unchanged app replays from the cache and a failure reproduces.
import { createHash } from "node:crypto";
import { test } from "@e2e-dev/web";

/** Agent steps need a model (E2E_ARMY_NOAGENT=1 is set by src/lib/e2earmy.ts when none is available): skip them, keep locator and API tests. */
export const needsModel = () => { test.skip(process.env.E2E_ARMY_NOAGENT === "1", "no model available — agent steps skipped"); };

/** Where the HTTP API lives: Mizano's Nest API has its own port (E2E_ARMY_API, `…/api`); FlowLine and NileQuant serve it from the web origin. */
export const apiBase = () => (process.env.E2E_ARMY_API ?? process.env.E2E_ARMY_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

const SEED = process.env.E2E_ARMY_SEED ?? "nql-e2e-army-1";
/** Deterministic test data: same (seed, name) → same value on every run and every machine. Use a distinct `name` per record inside one run. */
export const seeded = (name: string, len = 6) => `${name}-${createHash("sha1").update(`${SEED}:${name}`).digest("hex").slice(0, len)}`;
export const seededEmail = (name: string, domain = "army-e2e.test") => `${seeded(name)}@${domain}`;
/** Seeded integer in [min, max] (mulberry32) for amounts, quantities … */
export function seededInt(name: string, min: number, max: number): number {
  let a = parseInt(createHash("sha1").update(`${SEED}:${name}`).digest("hex").slice(0, 8), 16) >>> 0;
  a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return min + Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * (max - min + 1));
}
/** @deprecated random per run — breaks replay caching. Use seeded(). */
export const uniq = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
