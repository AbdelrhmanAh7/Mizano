/**
 * Post-merge CI red after PR #98 (issue #113, MZ #102).
 *
 * The red check was the GCP deploy SSH timeout, not a code regression. This pins the
 * observable claim that the API boots and reports healthy.
 */
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';

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
});
