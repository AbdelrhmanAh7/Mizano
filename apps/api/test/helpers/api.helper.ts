import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { generateTestToken } from './auth.helper';

/**
 * Supertest wrapper with automatic auth header injection.
 * Simplifies E2E test requests by handling JWT tokens.
 */
export class ApiHelper {
  private token: string;

  constructor(
    private app: INestApplication,
    token?: string,
  ) {
    this.token = token || generateTestToken();
  }

  /**
   * Set a different auth token (for testing other users/orgs)
   */
  withToken(token: string): ApiHelper {
    return new ApiHelper(this.app, token);
  }

  /**
   * GET request with auth
   */
  get(url: string) {
    return request(this.app.getHttpServer()).get(url).set('Authorization', `Bearer ${this.token}`);
  }

  /**
   * POST request with auth
   */
  post(url: string) {
    return request(this.app.getHttpServer()).post(url).set('Authorization', `Bearer ${this.token}`);
  }

  /**
   * PUT request with auth
   */
  put(url: string) {
    return request(this.app.getHttpServer()).put(url).set('Authorization', `Bearer ${this.token}`);
  }

  /**
   * PATCH request with auth
   */
  patch(url: string) {
    return request(this.app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${this.token}`);
  }

  /**
   * DELETE request with auth
   */
  delete(url: string) {
    return request(this.app.getHttpServer())
      .delete(url)
      .set('Authorization', `Bearer ${this.token}`);
  }

  /**
   * Unauthenticated GET (for testing auth enforcement)
   */
  getNoAuth(url: string) {
    return request(this.app.getHttpServer()).get(url);
  }

  /**
   * Unauthenticated POST (for login/register endpoints)
   */
  postNoAuth(url: string) {
    return request(this.app.getHttpServer()).post(url);
  }
}
