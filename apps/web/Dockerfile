# ============================================
# Next.js Web Dockerfile
# Multi-stage build for production
# ============================================

# Stage 1: Builder
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@8.14.0 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/validators/package.json ./packages/validators/

# Install dependencies (HUSKY=0 disables the husky prepare hook)
ENV HUSKY=0
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/web ./apps/web
COPY packages ./packages

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ARG NEXT_PUBLIC_API_URL=http://localhost:6001/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build shared packages first
RUN pnpm --filter @mizano/shared-types build && pnpm --filter @mizano/validators build

# Build the application
RUN pnpm --filter @mizano/web build \
  && rm -rf apps/web/.next/standalone/node_modules/sharp \
    apps/web/.next/standalone/node_modules/@img \
    apps/web/.next/standalone/apps/web/node_modules/sharp \
    apps/web/.next/standalone/apps/web/node_modules/@img

# Install image processing binaries on the target, without retaining npm cache.
FROM node:20-alpine AS native-deps
ARG SHARP_VERSION=0.34.5
RUN npm install --prefix /opt/sharp --no-audit --no-fund sharp@${SHARP_VERSION} \
  && cd /opt/sharp && node -e "require('sharp')"

# ============================================
# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=5001
# Bind all interfaces: standalone defaults to the container hostname, which breaks localhost healthchecks
ENV HOSTNAME=0.0.0.0

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --chown=nextjs:nodejs --from=builder /app/apps/web/.next/standalone ./
COPY --chown=nextjs:nodejs --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --chown=nextjs:nodejs --from=builder /app/apps/web/public ./apps/web/public

# Target-native sharp replaces the build-host package removed from standalone.
COPY --from=native-deps /opt/sharp/node_modules/ ./node_modules/

# Writable next/image cache (no recursive chown: it would duplicate every layer)
RUN mkdir -p apps/web/.next/cache && chown nextjs:nodejs apps/web/.next/cache

USER nextjs

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5001/robots.txt || exit 1

# Start the application
CMD ["node", "apps/web/server.js"]
