# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/

RUN npm install --workspaces --include-workspace-root

COPY . .

# Build shared
RUN npm run build --workspace=packages/shared

# Build frontend
RUN npm run build --workspace=apps/frontend

# Production stage — serve with nginx
FROM nginx:alpine AS runtime

COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
