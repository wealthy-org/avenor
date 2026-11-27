FROM node:22-alpine AS builder

WORKDIR /app

COPY packages/config ./packages/config
COPY services/indexer/package*.json ./services/indexer/

WORKDIR /app/services/indexer
RUN npm ci

COPY services/indexer ./

FROM node:22-alpine AS runner

WORKDIR /app/services/indexer

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app/services/indexer/node_modules ./node_modules
COPY --from=builder /app/services/indexer/package.json ./package.json
COPY --from=builder /app/services/indexer/src ./src
COPY --from=builder /app/services/indexer/migrations ./migrations

EXPOSE 3001

CMD ["node", "src/main.ts"]
