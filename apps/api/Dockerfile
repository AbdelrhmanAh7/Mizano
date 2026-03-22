# ============================================
# NestJS API Dockerfile
# Multi-stage build for production
# ============================================

# Stage 1: Build
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

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

# ============================================
# Stage 2: Production
FROM node:20-alpine AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set environment
ENV NODE_ENV=production
ENV PORT=6001

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy necessary files from builder
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules/.prisma ./node_modules/.prisma

# Change ownership to non-root user
RUN chown -R nestjs:nodejs /app

USER nestjs

# Expose port
EXPOSE 6001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:6001/health || exit 1

# Start the application
CMD ["node", "dist/main.js"]
