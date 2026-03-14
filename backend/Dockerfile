FROM node:20-alpine AS builder
WORKDIR /app

# Copy prisma schema from repo root
COPY prisma ./prisma

# Copy backend package manifests
COPY backend/package*.json ./

RUN npm ci

# Copy backend sources
COPY backend/src ./src
COPY backend/tsconfig.json ./tsconfig.json
COPY backend/entrypoint.sh ./entrypoint.sh
COPY backend/vitest.config.ts ./vitest.config.ts

RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY backend/entrypoint.sh ./entrypoint.sh

RUN chmod +x /app/entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["/app/entrypoint.sh"]
