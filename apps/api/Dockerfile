# ============================================
# NestJS API Dockerfile (multi-arch: amd64 + arm64)
#
# - `build` runs on the BUILD host architecture (no QEMU): install, prisma
#   generate (all binaryTargets), shared packages, nest build.
# - `deps` and `runtime` run on the TARGET architecture, so native modules
#   (bcrypt, sharp, ...) install with the right binaries.
# ============================================

# ---------- Stage 1: build (native on the build host) ----------
FROM --platform=$BUILDPLATFORM node:20-alpine AS build

RUN apk add --no-cache openssl \
  && corepack enable && corepack prepare pnpm@8.14.0 --activate

WORKDIR /app
ENV HUSKY=0 PUPPETEER_SKIP_DOWNLOAD=true ONNXRUNTIME_NODE_INSTALL=skip

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/validators/package.json ./packages/validators/
RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
COPY packages ./packages

# Generates the client plus engines for every binaryTarget in schema.prisma
RUN cd apps/api && pnpm exec prisma generate \
  && find /app/node_modules/.prisma/client -name 'libquery_engine-*' ! -name '*musl*' -delete
RUN pnpm --filter @mizano/shared-types build && pnpm --filter @mizano/validators build
RUN pnpm --filter api build

# Pinned Arabic/English assets are unpacked on the build host, never at runtime.
FROM --platform=$BUILDPLATFORM node:20-alpine AS ocr-assets
RUN npm install --prefix /assets --ignore-scripts --no-audit --no-fund \
      @tesseract.js-data/eng@1.0.0 @tesseract.js-data/ara@1.0.0 \
  && mkdir /tessdata \
  && node -e "const fs=require('fs'),zlib=require('zlib'); for (const lang of ['eng','ara']) fs.writeFileSync('/tessdata/'+lang+'.traineddata',zlib.gunzipSync(fs.readFileSync('/assets/node_modules/@tesseract.js-data/'+lang+'/4.0.0_best_int/'+lang+'.traineddata.gz')))"

# ---------- Stage 2: production deps (target architecture) ----------
FROM node:20-alpine AS deps

# bcrypt may need a source build when no target musl prebuild is published.
# Compiler tools stay in this disposable stage.
RUN apk add --no-cache openssl python3 make g++ \
  && corepack enable && corepack prepare pnpm@8.14.0 --activate

WORKDIR /app
ENV HUSKY=0 PUPPETEER_SKIP_DOWNLOAD=true ONNXRUNTIME_NODE_INSTALL=skip

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/validators/package.json ./packages/validators/
# Built workspace packages (the deploy step copies them into /out/node_modules)
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/packages/validators/dist ./packages/validators/dist

# Production-only deployable for the api (no web/dev dependencies). Lifecycle
# scripts are skipped (root `husky`, puppeteer Chrome download); native modules
# are then built/fetched for THIS (target) architecture.
# Isolated linker: with `hoisted`, pnpm deploy does not materialise top-level deps.
RUN npm_config_node_linker=isolated pnpm --filter api deploy --prod --ignore-scripts /out \
  && cd /out/node_modules \
  && (cd bcrypt && npm run install) \
  && node -e "require('sharp')" \
  && arch="$(node -p process.arch)" \
  && rm -rf onnxruntime-node/bin/napi-v6/darwin onnxruntime-node/bin/napi-v6/win32 \
  && find onnxruntime-node/bin/napi-v6/linux -mindepth 1 -maxdepth 1 ! -name "$arch" -exec rm -rf {} +

# Prisma CLI in an isolated prefix, only used for `prisma migrate deploy`
ARG PRISMA_VERSION=5.22.0
RUN npm install --prefix /opt/prisma --no-audit --no-fund prisma@${PRISMA_VERSION} \
  && npm cache clean --force

# ---------- Stage 3: runtime (target architecture) ----------
FROM node:20-alpine AS runtime

# Chromium preserves PDF rendering without Puppeteer runtime downloads.
RUN apk add --no-cache openssl chromium

ENV NODE_ENV=production \
    PORT=6001 \
    npm_config_offline=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PUPPETEER_SKIP_DOWNLOAD=true

# Non-root user. Files are copied with --chown (a recursive chown would
# duplicate the whole node_modules layer).
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs \
  && mkdir -p /app/apps/api && chown -R nestjs:nodejs /app

WORKDIR /app

COPY --chown=nestjs:nodejs --from=ocr-assets /tessdata/ ./apps/api/
COPY --chown=nestjs:nodejs --from=deps /out/node_modules ./node_modules
COPY --from=deps /opt/prisma /opt/prisma
COPY --chown=nestjs:nodejs --from=deps /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --chown=nestjs:nodejs --from=deps /app/packages/validators/package.json ./packages/validators/package.json
COPY --chown=nestjs:nodejs --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --chown=nestjs:nodejs --from=build /app/packages/validators/dist ./packages/validators/dist
# Generated Prisma client (musl engines only: arm64 + amd64)
COPY --chown=nestjs:nodejs --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=nestjs:nodejs --from=build /app/apps/api/dist ./apps/api/dist
COPY --chown=nestjs:nodejs --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --chown=nestjs:nodejs --from=build /app/apps/api/package.json ./apps/api/package.json

RUN mkdir -p /app/node_modules/.bin \
  && ln -s /opt/prisma/node_modules/prisma /app/node_modules/prisma \
  && ln -s ../prisma/build/index.js /app/node_modules/.bin/prisma

USER nestjs
EXPOSE 6001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:6001/api/health || exit 1

# Migrations: npx --no-install prisma migrate deploy (CLI and target engines are bundled).
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
