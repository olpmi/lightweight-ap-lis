# Build stage
FROM node:20-alpine AS builder

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace manifests and lockfile first (layer cache)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build shared
RUN pnpm --filter @lis/shared build

# Generate Prisma client
RUN ./node_modules/.bin/prisma generate --schema=prisma/schema.prisma

# Build backend
RUN pnpm --filter @lis/backend build

# Production stage
FROM node:20-alpine AS runtime

RUN apk add --no-cache openssl

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json .

EXPOSE 3001

CMD ["node", "apps/backend/dist/server.js"]
