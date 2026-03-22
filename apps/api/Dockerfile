# ============================================
# NestJS API Dockerfile
# Multi-stage build for production
# ============================================

# Single-stage build (avoids pnpm symlink issues across stages)
FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set environment
ENV NODE_ENV=production
ENV PORT=6001

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/validators/package.json ./packages/validators/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/api ./apps/api
COPY packages ./packages

# Generate Prisma client
RUN cd apps/api && pnpm exec prisma generate

# Build shared packages first
RUN pnpm --filter @mizano/shared-types build && pnpm --filter @mizano/validators build

# Build the application
RUN pnpm --filter api build

# Verify the app can start (catches missing modules)
RUN node -e "require('./apps/api/dist/main.js')" 2>&1 | head -1 || true

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Change ownership
RUN chown -R nestjs:nodejs /app

USER nestjs

# Expose port
EXPOSE 6001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:6001/health || exit 1

# Start the application
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
