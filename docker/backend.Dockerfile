# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies
RUN npm install --workspaces --include-workspace-root

# Copy source
COPY . .

# Build shared
RUN npm run build --workspace=packages/shared

# Generate Prisma client
RUN npx prisma generate --schema=prisma/schema.prisma

# Build backend
RUN npm run build --workspace=apps/backend

# Production stage
FROM node:20-alpine AS runtime

RUN apk add --no-cache openssl

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json .

# Prisma client location
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3001

CMD ["node", "apps/backend/dist/server.js"]
