# ============================================
# NestJS API Dockerfile
# Two stages: build with every dependency, then ship only production dependencies.
# The same image runs the API, the intake worker and the one-shot `prisma migrate deploy`.
# ============================================

# ---------- Stage 1: build ----------
FROM node:20-alpine AS build

# OpenSSL is required by the Prisma engine (Alpine ships OpenSSL 3.x).
RUN apk add --no-cache openssl
# Skip Puppeteer's Chrome download; the runtime stage uses Alpine's own Chromium.
ENV PUPPETEER_SKIP_DOWNLOAD=1 HUSKY=0

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files + .npmrc (includes supportedArchitectures for linux binaries)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/validators/package.json ./packages/validators/

RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/api ./apps/api
COPY packages ./packages

# Generate Prisma client, build shared packages, then the application
RUN cd apps/api && pnpm exec prisma generate
RUN pnpm --filter @mizano/shared-types build && pnpm --filter @mizano/validators build
RUN pnpm --filter api build

# Keep production dependencies only (about 1 GB less). Two things from the full install stay:
# the Prisma CLI (a dev dependency) for the one-shot `prisma migrate deploy`, and the generated
# Prisma client. The reinstall uses the store this stage already filled (--offline). The root
# `prepare` script runs husky, a dev dependency, so it is dropped from this stage first.
RUN npm pkg delete scripts.prepare \
  && mkdir /keep \
  && cp -a node_modules/prisma node_modules/@prisma node_modules/.prisma /keep/ \
  && rm -rf node_modules apps/*/node_modules packages/*/node_modules \
  && pnpm install --frozen-lockfile --prod --offline --filter 'api...' \
  && rm -rf node_modules/prisma node_modules/@prisma node_modules/.prisma \
  && cp -a /keep/prisma /keep/@prisma /keep/.prisma node_modules/ \
  && mkdir -p node_modules/.bin \
  && ln -sf ../prisma/build/index.js node_modules/.bin/prisma \
  && rm -rf /keep \
  # The hoisted install also keeps the web app's packages; Next.js alone is about 350 MB.
  && rm -rf node_modules/next node_modules/@next \
  && node apps/api/scripts/check-runtime-deps.js

# ---------- Stage 2: runtime ----------
FROM node:20-alpine

# Invoice/statement PDFs are rendered by Puppeteer with Alpine's own Chromium: Chrome for
# Testing is a glibc x64 build with no linux-arm64 release, so it can run neither here nor on
# the Raspberry Pi. The renderer has no network, so it needs system fonts: Noto Arabic shapes
# Arabic text, DejaVu covers Latin and symbols.
RUN apk add --no-cache openssl \
    chromium nss freetype harfbuzz ca-certificates \
    fontconfig font-noto-arabic font-dejavu

ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
# Fail the build, not the first PDF, if the browser or the Arabic font is missing.
RUN test -x "$PUPPETEER_EXECUTABLE_PATH" && fc-list | grep -qi "noto.*arabic"

ENV PORT=6001 NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

WORKDIR /app
# --chown on the copy: a separate `chown -R` layer would store node_modules a second time.
COPY --from=build --chown=nestjs:nodejs /app /app

USER nestjs

# Expose port
EXPOSE 6001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:6001/api/health || exit 1

# Start the application
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
