import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

/**
 * Supertest wrapper that sends a real bearer token (see `registerTenant`). There is no default
 * token: a request is either made as a registered user or explicitly anonymous. Requests ask for
 * English (`Accept-Language: en`) unless `withLanguage` picks another language.
 */
export class ApiHelper {
  constructor(
    private readonly app: INestApplication,
    private readonly token: string | null,
    private readonly language: 'ar' | 'en' = 'en',
  ) {}

  /** Same app, no Authorization header. */
  static anonymous(app: INestApplication): ApiHelper {
    return new ApiHelper(app, null);
  }

  withToken(token: string | null): ApiHelper {
    return new ApiHelper(this.app, token, this.language);
  }

  /** Same user, answered in `language`. */
  withLanguage(language: 'ar' | 'en'): ApiHelper {
    return new ApiHelper(this.app, this.token, language);
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
    const localized = req.set('Accept-Language', this.language);
    return this.token ? localized.set('Authorization', `Bearer ${this.token}`) : localized;
  }
}
