# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl python3 make g++
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG DOCKER_FAST_BUILD=1
ENV DOCKER_FAST_BUILD=${DOCKER_FAST_BUILD}
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm run prisma:generate
COPY . .
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/app/.next/cache \
    npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat openssl bash openssh-client git
COPY --link --from=builder /app/.next ./.next
COPY --link --from=builder /app/public ./public
COPY --link --from=builder /app/node_modules ./node_modules
COPY --link --from=builder /app/prisma ./prisma
COPY --link --from=builder /app/scripts ./scripts
COPY --link --from=builder /app/package.json ./package.json
COPY --link --from=builder /app/next.config.ts ./next.config.ts
COPY --link --from=builder /app/server.mjs ./server.mjs
RUN chmod +x ./scripts/start-web.sh
EXPOSE 3000
CMD ["./scripts/start-web.sh"]
