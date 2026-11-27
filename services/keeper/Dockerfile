FROM node:22-alpine AS builder

WORKDIR /app

COPY packages/config ./packages/config
COPY packages/sdk ./packages/sdk
COPY services/keeper/package*.json ./services/keeper/

WORKDIR /app/packages/sdk
RUN npm ci || true

WORKDIR /app/services/keeper
RUN npm ci

COPY services/keeper ./

FROM node:22-alpine AS runner

WORKDIR /app/services/keeper

ENV NODE_ENV=production

COPY --from=builder /app/packages/sdk /app/packages/sdk
COPY --from=builder /app/services/keeper/node_modules ./node_modules
COPY --from=builder /app/services/keeper/package.json ./package.json
COPY --from=builder /app/services/keeper/src ./src

CMD ["node", "src/main.ts"]
