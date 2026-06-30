# --- Build stage -----------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Prisma needs openssl; bookworm provides openssl 3 (matches debian-openssl-3.0.x).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install all workspace deps (manifests first for better layer caching).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts

# Build shared + generate Prisma client + build API.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace @ai-phone/shared \
  && npm run db:generate --workspace @ai-phone/api \
  && npm run build --workspace @ai-phone/api

# --- Runtime stage ---------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# node_modules carries the generated Prisma client + query engine and the
# @ai-phone/shared workspace symlink (target copied below).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api
EXPOSE 4000
# Apply migrations on boot, then start the API. (For zero-downtime deploys, run
# `prisma migrate deploy` as a separate release step instead.)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
