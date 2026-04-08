FROM node:20-alpine

RUN apk add --no-cache openssl

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Install deps from manifests only (will be overridden by volume mount at runtime,
# but needed when building the image without a mounted volume)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

EXPOSE 5173
