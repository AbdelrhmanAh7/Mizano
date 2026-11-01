/** One place for the throwaway stack's settings (no real secrets: every value only works against the local stack). */
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5101);
export const API_PORT = Number(process.env.E2E_API_PORT ?? 6101);
// "localhost", not 127.0.0.1: the web app redirects between locale paths using the host name "localhost".
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://127.0.0.1:${API_PORT}/api`;

export const apiEnv = {
  APP_ENV: 'e2e',
  NODE_ENV: 'development',
  API_PORT: String(API_PORT),
  DATABASE_URL: 'postgresql://e2e:e2e@127.0.0.1:5499/jarda_e2e',
  REDIS_URL: 'redis://127.0.0.1:6499',
  JWT_SECRET: 'e2e-jwt-secret-not-for-anything-real-0123456789',
  JWT_REFRESH_SECRET: 'e2e-jwt-refresh-secret-not-real-0123456789',
  JWT_EXPIRATION: '15m',
  JWT_REFRESH_EXPIRATION: '7d',
  CORS_ORIGIN: WEB_URL,
  FRONTEND_URL: WEB_URL,
  INTAKE_EXTRACTION_STRATEGY: 'rules',
  // A local run must not inherit real services from the developer's .env: no mail, no AI server, no Telegram.
  MAIL_SMTP_HOST: '',
  MAIL_SMTP_USER: '',
  MAIL_SMTP_PASSWORD: '',
  AI_OLLAMA_BASE_URL: '',
  TELEGRAM_BOT_TOKEN: '',
  // Journeys sign up and sign in many times from one address.
  RATE_LIMIT_TTL: '1000',
  RATE_LIMIT_MAX: '10000',
  RATE_LIMIT_AUTH_MAX: '10000',
  AUTH_RATE_LIMIT_PER_MIN: '1000',
  LOG_LEVEL: 'warn',
};

export const webEnv = {
  NODE_ENV: 'development',
  NEXTAUTH_URL: WEB_URL,
  NEXTAUTH_SECRET: 'e2e-nextauth-secret-not-real-0123456789abcdef',
  NEXT_PUBLIC_API_URL: API_URL,
  API_INTERNAL_URL: API_URL,
  NEXT_TELEMETRY_DISABLED: '1',
};
