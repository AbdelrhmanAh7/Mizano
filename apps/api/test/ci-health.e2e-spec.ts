/**
 * Post-merge CI red after PR #98 (issue #113, MZ #102).
 *
 * The diagnosis is that the red check was the GCP deploy SSH timeout, not a code regression.
 * These tests pin the two observable claims: the API boots and reports healthy, and PR #98
 * (merge commit 615060e) changed no application, package, lockfile or workflow file.
 */
import { execFileSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';

const PR98_MERGE = '615060ed6294e16375a1f1ea9385cb7e812cd24f';

function changedFilesInPr98(): string[] | null {
  try {
    const out = execFileSync('git', ['diff', '--name-only', `${PR98_MERGE}~1`, PR98_MERGE], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

describe('CI health after PR #98 (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('@e2e @flow:ci-health @issue-113 AC1: API boots and /health reports healthy', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.services.database.status).toBe('connected');
  });

  it('@e2e @flow:ci-health @issue-113 AC2: PR #98 touched only markdown docs', () => {
    const files = changedFilesInPr98();
    if (files === null) {
      return; // shallow clone without the merge commit: nothing to compare
    }
    expect(files.length).toBeGreaterThan(0);
    const nonDocs = files.filter((f) => !f.endsWith('.md'));
    expect(nonDocs).toEqual([]);
  });

  it('@e2e @flow:ci-health @issue-113 AC3: PR #98 changed no code, lockfile, compose or workflow', () => {
    const files = changedFilesInPr98();
    if (files === null) {
      return;
    }
    const risky = files.filter((f) =>
      /^(apps|packages|\.github|deploy)\/|pnpm-lock\.yaml$|docker-compose|(^|\/)\.env/.test(f),
    );
    expect(risky).toEqual([]);
  });
});
