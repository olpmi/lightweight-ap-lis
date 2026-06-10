# Build stage
FROM node:26-alpine AS builder

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@11 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

COPY . .

# Build shared
RUN pnpm --filter @lis/shared build

# VITE_PASSWORD_AUTH is baked into the bundle at build time.
# Pass --build-arg VITE_PASSWORD_AUTH=true when building production images.
ARG VITE_PASSWORD_AUTH=false
ENV VITE_PASSWORD_AUTH=${VITE_PASSWORD_AUTH}

# Build frontend
RUN pnpm --filter @lis/frontend build

# Production stage — serve with nginx
FROM nginx:alpine AS runtime

COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
