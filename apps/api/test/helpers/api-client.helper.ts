import { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * Supertest wrapper that sends a real bearer token (see `registerTenant`). There is no default
 * token: a request is either made as a registered user or explicitly anonymous.
 */
export class ApiHelper {
  constructor(
    private readonly app: INestApplication,
    private readonly token: string | null,
  ) {}

  /** Same app, no Authorization header. */
  static anonymous(app: INestApplication): ApiHelper {
    return new ApiHelper(app, null);
  }

  withToken(token: string | null): ApiHelper {
    return new ApiHelper(this.app, token);
  }

  get(url: string): request.Test {
    return this.authorize(this.http().get(url));
  }

  post(url: string): request.Test {
    return this.authorize(this.http().post(url));
  }

  put(url: string): request.Test {
    return this.authorize(this.http().put(url));
  }

  patch(url: string): request.Test {
    return this.authorize(this.http().patch(url));
  }

  delete(url: string): request.Test {
    return this.authorize(this.http().delete(url));
  }

  private http(): ReturnType<typeof request> {
    return request(this.app.getHttpServer());
  }

  private authorize(req: request.Test): request.Test {
    return this.token ? req.set('Authorization', `Bearer ${this.token}`) : req;
  }
}
