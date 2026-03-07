# Scripts Reference

All available scripts in the Mizano ERP monorepo.

## Development

| Script              | Description                                                    | Prerequisites       |
| ------------------- | -------------------------------------------------------------- | ------------------- |
| `pnpm dev`          | Start infra (postgres+redis) + all apps (web: 5001, api: 6001) | Docker running      |
| `pnpm dev:local`    | Same as `dev` with `APP_ENV=local` explicitly set              | Docker running      |
| `pnpm dev:api`      | Start API only (NestJS, port 6001)                             | Database running    |
| `pnpm dev:web`      | Start web only (Next.js, port 5001)                            | API running         |
| `pnpm dev:ocr`      | Start OCR service container (PaddleOCR + Tesseract)            | Docker running      |
| `pnpm dev:vlm`      | Start VLM service container (requires GPU)                     | Docker + NVIDIA GPU |
| `pnpm dev:with-ocr` | Start infra + OCR + all apps                                   | Docker running      |

## Build

| Script            | Description                      | Prerequisites          |
| ----------------- | -------------------------------- | ---------------------- |
| `pnpm build`      | Build all packages via Turborepo | Dependencies installed |
| `pnpm build:dev`  | Build with `APP_ENV=dev`         | Dependencies installed |
| `pnpm build:sit`  | Build with `APP_ENV=sit`         | Dependencies installed |
| `pnpm build:prod` | Build with `APP_ENV=prod`        | Dependencies installed |

## Code Quality

| Script              | Description                                  | Prerequisites          |
| ------------------- | -------------------------------------------- | ---------------------- |
| `pnpm lint`         | Lint all packages (no auto-fix)              | Dependencies installed |
| `pnpm lint:fix`     | Lint all packages with auto-fix              | Dependencies installed |
| `pnpm format`       | Format all files with Prettier               | Dependencies installed |
| `pnpm format:check` | Check formatting without writing             | Dependencies installed |
| `pnpm type-check`   | TypeScript type checking across all packages | Dependencies installed |
| `pnpm validate`     | Run lint + type-check                        | Dependencies installed |
| `pnpm ci`           | Run lint + type-check + test (CI pipeline)   | Dependencies installed |

## Testing

| Script                     | Description                             | Prerequisites                      |
| -------------------------- | --------------------------------------- | ---------------------------------- |
| `pnpm test`                | Run all tests via Turborepo             | Dependencies installed             |
| `pnpm test:api`            | API unit tests (Jest)                   | Dependencies installed             |
| `pnpm test:web`            | Web tests                               | Dependencies installed             |
| `pnpm test:watch`          | API tests in watch mode                 | Dependencies installed             |
| `pnpm test:cov`            | API coverage report                     | Dependencies installed             |
| `pnpm test:e2e`            | API end-to-end tests                    | Database running                   |
| `pnpm test:regression`     | Run regression test suite               | Dependencies installed             |
| `pnpm test:regression:api` | API regression tests only               | Dependencies installed             |
| `pnpm test:regression:web` | Frontend regression tests only          | Dependencies installed             |
| `pnpm test:playwright`     | Frontend E2E tests (Playwright)         | App running + Playwright installed |
| `pnpm ci:full`             | Full CI: lint + type-check + test + e2e | Database running                   |

## Database

| Script             | Description                            | Prerequisites          |
| ------------------ | -------------------------------------- | ---------------------- |
| `pnpm db:generate` | Generate Prisma client                 | Dependencies installed |
| `pnpm db:push`     | Push schema to database (no migration) | Database running       |
| `pnpm db:migrate`  | Run Prisma migrations                  | Database running       |
| `pnpm db:reset`    | Reset database + re-seed               | Database running       |
| `pnpm db:seed`     | Seed database with sample data         | Database running       |
| `pnpm db:studio`   | Open Prisma Studio (GUI)               | Database running       |
| `pnpm db:check`    | Validate Prisma schema                 | Dependencies installed |

## Docker / Infrastructure

| Script                  | Description                                             | Prerequisites                   |
| ----------------------- | ------------------------------------------------------- | ------------------------------- |
| `pnpm docker:up`        | Start PostgreSQL + Redis                                | Docker running                  |
| `pnpm docker:up:ocr`    | Start PostgreSQL + Redis + OCR service                  | Docker running                  |
| `pnpm docker:up:vlm`    | Start PostgreSQL + Redis + VLM service                  | Docker + NVIDIA GPU             |
| `pnpm docker:down`      | Stop all containers                                     | Docker running                  |
| `pnpm docker:logs`      | Tail container logs                                     | Docker running                  |
| `pnpm docker:dev`       | Start infra with `.env.dev`                             | Docker + `.env.dev` configured  |
| `pnpm docker:sit`       | Start infra with `.env.sit` (production-like resources) | Docker + `.env.sit` configured  |
| `pnpm docker:prod`      | Build & start production stack                          | Docker + `.env.prod` configured |
| `pnpm docker:prod:down` | Stop production stack                                   | Docker running                  |
| `pnpm status`           | Show running containers                                 | Docker running                  |

## Utilities

| Script                     | Description                                                   | Prerequisites          |
| -------------------------- | ------------------------------------------------------------- | ---------------------- |
| `pnpm env:check`           | Verify the correct `.env.*` file exists for current `APP_ENV` | Node.js                |
| `pnpm generate:types`      | Build shared-types package                                    | Dependencies installed |
| `pnpm generate:validators` | Build validators package                                      | Dependencies installed |
| `pnpm clean`               | Remove node_modules and Turbo cache                           | None                   |
| `pnpm clean:full`          | Deep clean (includes .next, dist, coverage)                   | None                   |
| `pnpm prepare`             | Setup Husky git hooks (runs automatically on install)         | Dependencies installed |

## Environment System

Mizano uses a 4-environment configuration system:

| Environment | File         | APP_ENV | NODE_ENV    | Purpose                         |
| ----------- | ------------ | ------- | ----------- | ------------------------------- |
| Local       | `.env.local` | local   | development | Localhost development (default) |
| Development | `.env.dev`   | dev     | development | Shared development server       |
| SIT         | `.env.sit`   | sit     | production  | System Integration Testing      |
| Production  | `.env.prod`  | prod    | production  | Production deployment           |

The API resolves env files in order: `.env.${APP_ENV}` -> `.env`

See `docs/environment-guide.md` for full details.
