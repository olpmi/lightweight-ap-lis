FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

# Install deps from manifests only (will be overridden by volume mount at runtime,
# but needed when building the image without a mounted volume)
COPY package.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/

RUN npm install --workspaces --include-workspace-root

EXPOSE 5173
