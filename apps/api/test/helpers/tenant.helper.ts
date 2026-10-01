import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ApiHelper } from './api-client.helper';
import { uniqueSuffix } from './app.helper';

export const TEST_PASSWORD = 'E2eJourney123';

export interface TestTenant {
  email: string;
  password: string;
  userId: string;
  organizationId: string;
  organizationName: string;
  accessToken: string;
  refreshToken: string;
  /** Authenticated client for this tenant's user. */
  api: ApiHelper;
}

/**
 * Registers a brand-new organization and admin user through POST /auth/register, then logs in
 * through POST /auth/login and returns the access token issued by the login. Nothing is forged:
 * the user and organization exist in the database and the JWT is signed by the app.
 */
export async function registerTenant(app: INestApplication, label: string): Promise<TestTenant> {
  const suffix = uniqueSuffix();
  const email = `e2e-${label.toLowerCase()}-${suffix}@mizano.test`;
  const organizationName = `E2E ${label} ${suffix}`;
  const http = request(app.getHttpServer());

  const registered = await http.post('/auth/register').send({
    email,
    password: TEST_PASSWORD,
    firstName: 'E2E',
    lastName: label,
    organizationName,
  });
  if (registered.status !== 201) {
    throw new Error(`register ${label} failed: ${registered.status} ${registered.text}`);
  }

  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: TEST_PASSWORD });
  if (login.status !== 200) {
    throw new Error(`login ${label} failed: ${login.status} ${login.text}`);
  }

  const { user, organization, tokens } = login.body as {
    user: { id: string; organizationId: string };
    organization: { id: string; name: string };
    tokens: { accessToken: string; refreshToken: string };
  };

  return {
    email,
    password: TEST_PASSWORD,
    userId: user.id,
    organizationId: organization.id,
    organizationName: organization.name,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    api: new ApiHelper(app, tokens.accessToken),
  };
}
