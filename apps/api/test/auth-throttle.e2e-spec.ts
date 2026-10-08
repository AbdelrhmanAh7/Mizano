/**
 * Login throttling behind a reverse proxy (issue #132).
 *
 * nginx and cloudflared forward every browser's request from the same address, so the
 * 5-per-minute login limit must count each client by its X-Forwarded-For address, not by the
 * proxy's socket address. Unlike `createTestApp`, this suite keeps the real throttler storage.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { uniqueSuffix } from './helpers/app.helper';

const LOGIN_LIMIT = 5;

describe('@e2e @flow:auth-throttle @issue-132 login throttling per client', () => {
  let app: INestApplication;
  const email = `e2e-throttle-${uniqueSuffix()}@mizano.test`;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function failedLogin(forwardedFor: string): request.Test {
    return request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', forwardedFor)
      .send({ email, password: 'wrong-password' });
  }

  it('@issue-132 AC2: one client exceeding the login limit does not lock out another client', async () => {
    const attacker = '203.0.113.10';
    for (let attempt = 0; attempt < LOGIN_LIMIT; attempt += 1) {
      expect((await failedLogin(attacker)).status).toBe(401);
    }
    expect((await failedLogin(attacker)).status).toBe(429);

    expect((await failedLogin('198.51.100.7')).status).toBe(401);
  });

  it('@issue-132 AC2: the proxy-appended (right-most) address is counted, not a client-supplied prefix', async () => {
    const realClient = '192.0.2.44';
    for (let attempt = 0; attempt < LOGIN_LIMIT; attempt += 1) {
      const spoofedPrefix = `10.0.0.${attempt + 1}`;
      expect((await failedLogin(`${spoofedPrefix}, ${realClient}`)).status).toBe(401);
    }
    expect((await failedLogin(`10.9.9.9, ${realClient}`)).status).toBe(429);
  });
});
