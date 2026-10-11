# Evidence for Issue #183: Secure Docker Compose Production Stacks

## Acceptance Criteria Verification

### AC1: `docker compose config` shows no published 5432/6379 ports

**Verification Method**: Manual inspection of `docker-compose.production.yml` and `deploy/pi/docker-compose.pi.yml`

**Evidence**:

- **docker-compose.production.yml**: Postgres service (lines 97-128) has no `ports` section. Redis service (lines 133-156) has no `ports` section (removed in this commit).
- **deploy/pi/docker-compose.pi.yml**: Postgres service (lines 14-43) and Redis service (lines 45-69) have no `ports` sections (already omitted).

**File:Line References**:

- `docker-compose.production.yml:97-128` - Postgres service, no ports
- `docker-compose.production.yml:133-156` - Redis service, no ports
- `deploy/pi/docker-compose.pi.yml:14-43` - Postgres service, no ports
- `deploy/pi/docker-compose.pi.yml:45-69` - Redis service, no ports

### AC2: Redis requires password

**Verification Method**: Manual inspection of Redis service configuration in both docker-compose files

**Evidence**:

- **docker-compose.production.yml** (lines 137-152):
  - Environment: `REDIS_PASSWORD=${REDIS_PASSWORD:?REDIS_PASSWORD is required}` (line 138)
  - Command: `redis-server --requirepass ${REDIS_PASSWORD} ...` (line 140)
  - Healthcheck: `redis-cli -a "$$REDIS_PASSWORD" --no-auth-warning ping` (line 152)

- **deploy/pi/docker-compose.pi.yml** (lines 48-67):
  - Environment: `REDIS_PASSWORD=${REDIS_PASSWORD:?REDIS_PASSWORD is required}` (line 49)
  - Command: includes `--requirepass ${REDIS_PASSWORD}` (lines 52-53)
  - Healthcheck: `redis-cli -a $$REDIS_PASSWORD --no-auth-warning ping` (line 64)

**File:Line References**:

- `docker-compose.production.yml:138` - Redis password required variable
- `docker-compose.production.yml:140` - Redis command with --requirepass
- `docker-compose.production.yml:152` - Redis healthcheck with authentication
- `deploy/pi/docker-compose.pi.yml:49` - Redis password required variable
- `deploy/pi/docker-compose.pi.yml:52-53` - Redis command with --requirepass
- `deploy/pi/docker-compose.pi.yml:64` - Redis healthcheck with authentication

### AC3: Required variable enforcement for POSTGRES_PASSWORD and REDIS_PASSWORD

**Verification Method**: Manual inspection of environment variable definitions

**Evidence**:

- **docker-compose.production.yml**:
  - Postgres: `POSTGRES_PASSWORD=${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}` (line 103)
  - Redis: `REDIS_PASSWORD=${REDIS_PASSWORD:?REDIS_PASSWORD is required}` (line 138)

- **deploy/pi/docker-compose.pi.yml**:
  - Postgres: `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}` (line 20)
  - Redis: `REDIS_PASSWORD=${REDIS_PASSWORD:?REDIS_PASSWORD is required}` (line 49)

**File:Line References**:

- `docker-compose.production.yml:103` - Postgres required password
- `docker-compose.production.yml:138` - Redis required password
- `deploy/pi/docker-compose.pi.yml:20` - Postgres required password
- `deploy/pi/docker-compose.pi.yml:49` - Redis required password

### AC4: Service connection URLs include passwords

**Verification Method**: Manual inspection of service environment variables

**Evidence**:

- **docker-compose.production.yml** (line 22):
  - API service: `REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0`
  - DATABASE_URL uses `${POSTGRES_PASSWORD}` variable (line 21): `DATABASE_URL=${DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}}`

- **deploy/pi/docker-compose.pi.yml** (line 96):
  - API service: `REDIS_URL: ${REDIS_URL:?set REDIS_URL}` (requires REDIS_URL to be set from .env.pi with password)

- **deploy/pi/.env.pi.example** (lines 16-17):
  - `REDIS_PASSWORD=REPLACE_ME`
  - `REDIS_URL=redis://:REPLACE_ME@redis:6379/0`

**File:Line References**:

- `docker-compose.production.yml:21-22` - API service DATABASE_URL and REDIS_URL
- `deploy/pi/docker-compose.pi.yml:96` - API service REDIS_URL requires explicit setting
- `deploy/pi/.env.pi.example:16-17` - Redis password and URL with password placeholder

### AC5: Environment template files updated

**Verification Method**: Manual inspection of .env.example files

**Evidence**:

- **.env.example** (lines 6-10):
  - Added `POSTGRES_PASSWORD=` and `REDIS_PASSWORD=` placeholders
  - Added note: "Both are REQUIRED for production (docker-compose.production.yml enforces with :?)"

- **deploy/pi/.env.pi.example** (lines 15-17):
  - Added `REDIS_PASSWORD=REPLACE_ME`
  - Updated `REDIS_URL=redis://:REPLACE_ME@redis:6379/0`

**File:Line References**:

- `.env.example:6-10` - Required secrets section with placeholders
- `deploy/pi/.env.pi.example:15-17` - Redis password and URL with password

## Test Results

- **Lint**: ✅ Passed (only pre-existing warnings)
- **Type-check**: ✅ Passed
- **API Unit Tests**: ✅ 2211 tests passed

## Notes

- The `.github/workflows/deploy.yml` file generates `REDIS_URL=redis://redis:6379` without password (line 225). Per owner directives, workflow files were not modified. This should be addressed separately if needed for production deployments.
- All changes are backward compatible with the existing `.env.prod` and `.env.pi` files as long as operators update them with the new required variables.
