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
ENV HUSKY=0 PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/validators/package.json ./packages/validators/
RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
COPY packages ./packages

# Generates the client plus engines for every binaryTarget in schema.prisma,
# then keeps only the TARGET musl engine (each engine is ~15 MB).
ARG TARGETARCH
RUN cd apps/api && pnpm exec prisma generate \
  && if [ "$TARGETARCH" = arm64 ]; then keep=linux-musl-arm64-openssl; else keep=linux-musl-openssl; fi \
  && find /app/node_modules/.prisma/client -name 'libquery_engine-*' ! -name "*${keep}*" -delete \
  && test "$(find /app/node_modules/.prisma/client -name 'libquery_engine-*' | wc -l)" = 1
RUN pnpm --filter @mizano/shared-types build && pnpm --filter @mizano/validators build
# tsc needs the 10 MB client type declarations; the runtime never reads them.
RUN pnpm --filter api build \
  && rm -f /app/node_modules/.prisma/client/index.d.ts

# Pinned Arabic/English assets are unpacked on the build host, never at runtime.
FROM --platform=$BUILDPLATFORM node:20-alpine AS ocr-assets
COPY apps/api/ocr-assets.sha256 /ocr-assets.sha256
RUN npm install --prefix /assets --ignore-scripts --no-audit --no-fund \
      @tesseract.js-data/eng@1.0.0 @tesseract.js-data/ara@1.0.0 \
  && mkdir /tessdata \
  && node -e "const fs=require('fs'),zlib=require('zlib'); for (const lang of ['eng','ara']) fs.writeFileSync('/tessdata/'+lang+'.traineddata',zlib.gunzipSync(fs.readFileSync('/assets/node_modules/@tesseract.js-data/'+lang+'/4.0.0_best_int/'+lang+'.traineddata.gz')))" \
  && cd /tessdata && sha256sum -c /ocr-assets.sha256

# ---------- Stage 2: production deps (target architecture) ----------
FROM node:20-alpine AS deps

# bcrypt may need a source build when no target musl prebuild is published.
# Compiler tools stay in this disposable stage.
RUN apk add --no-cache openssl python3 make g++ \
  && corepack enable && corepack prepare pnpm@8.14.0 --activate

WORKDIR /app
ENV HUSKY=0 PUPPETEER_SKIP_DOWNLOAD=true

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
#
# Image-size trims, each followed by a require() check:
# - .npmrc lists both libc variants, so pnpm also materialises the glibc
#   sharp/libvips packages (~33 MB) that alpine (musl) can never load.
# - pdf-parse 1.1.1 bundles four pdf.js builds plus test PDFs (~35 MB); the
#   api calls it without a `version` option, so only v1.10.100 is ever loaded.
# - natural requires wordnet-db (34 MB) lazily, inside the WordNet
#   constructor; the api never uses WordNet.
RUN npm_config_node_linker=isolated pnpm --filter api deploy --prod --ignore-scripts /out \
  && cd /out/node_modules \
  && (cd bcrypt && npm run install) \
  && rm -rf @img/sharp-linux-* @img/sharp-libvips-linux-* \
       .pnpm/@img+sharp-linux-* .pnpm/@img+sharp-libvips-linux-* \
  && rm -rf .pnpm/pdf-parse@*/node_modules/pdf-parse/test \
  && find .pnpm/pdf-parse@*/node_modules/pdf-parse/lib/pdf.js -mindepth 1 -maxdepth 1 -type d ! -name v1.10.100 -exec rm -rf {} + \
  && rm -rf wordnet-db .pnpm/wordnet-db@* \
  && node -e "require('bcrypt'); require('sharp'); require('pdf-parse'); require('natural'); require('puppeteer'); require('tesseract.js')"

# Prisma CLI in an isolated prefix, only used for `prisma migrate deploy`
ARG PRISMA_VERSION=5.22.0
RUN npm install --prefix /opt/prisma --no-audit --no-fund prisma@${PRISMA_VERSION} \
  && npm cache clean --force

# ---------- Stage 3: runtime (target architecture) ----------
FROM node:20-alpine AS runtime

# Chromium preserves PDF rendering without Puppeteer runtime downloads.
# Its apk dependency chain pulls in the mesa/LLVM GPU driver stack (~215 MB)
# that headless Chromium never loads: it ships its own ANGLE/SwiftShader GL
# (libEGL/libGLESv2 under /usr/lib/chromium). The CI gate renders a PDF and a
# screenshot offline on every target arch to prove the trimmed image works.
# font-noto-naskh-arabic (1.9 MB) gives Arabic/RTL PDFs real glyphs through
# fontconfig fallback; Latin text and digits use font-opensans, which the
# chromium package already depends on.
RUN apk add --no-cache openssl chromium font-noto-naskh-arabic poppler-utils util-linux-misc \
  && rm -rf /usr/lib/libLLVM* /usr/lib/libgallium* /usr/lib/dri /usr/lib/gbm \
       /usr/lib/libvulkan* /usr/share/vulkan /usr/lib/libxatracker*

ENV NODE_ENV=production \
    PORT=6001 \
    npm_config_offline=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PUPPETEER_SKIP_DOWNLOAD=true \
    INTAKE_TESSDATA_DIR=/app/tessdata

# Non-root user. Files are copied with --chown (a recursive chown would
# duplicate the whole node_modules layer).
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs \
  && mkdir -p /app/apps/api && chown -R nestjs:nodejs /app

WORKDIR /app

# Bundled eng/ara traineddata; the api reads them from INTAKE_TESSDATA_DIR.
COPY --chown=nestjs:nodejs --from=ocr-assets /tessdata/ ./tessdata/
COPY --chown=nestjs:nodejs --from=ocr-assets /ocr-assets.sha256 ./apps/api/ocr-assets.sha256
COPY --chown=nestjs:nodejs --from=deps /out/node_modules ./node_modules
COPY --from=deps /opt/prisma /opt/prisma
COPY --chown=nestjs:nodejs --from=deps /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --chown=nestjs:nodejs --from=deps /app/packages/validators/package.json ./packages/validators/package.json
COPY --chown=nestjs:nodejs --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --chown=nestjs:nodejs --from=build /app/packages/validators/dist ./packages/validators/dist
# Generated Prisma client (target musl engine only)
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
  CMD ["node", "/app/apps/api/dist/health/healthcheck.js"]

# Migrations: npx --no-install prisma migrate deploy (CLI and target engines are bundled).
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
