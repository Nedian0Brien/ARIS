# ARIS Web

Next.js 15 App Router frontend for ARIS.

## Core Features

- JWT-based auth with role-aware access (`operator`, `viewer`)
- Chat-first session workspace with per-session chat threads
- Runtime event timeline with typed rendering:
  - `text_reply`
  - `run_execution`, `exec_execution`, `git_execution`, `docker_execution`
  - `file_list`, `file_read`, `file_write`
- Permission center and operator actions (`abort`, `retry`, `kill`, `resume`)
- Session metadata (alias, pin, last-read cursor)
- Optional SSH fallback link issuance with audit logging
- Prisma-backed user/auth/audit/chat metadata persistence

## Environment

Create env file:

```bash
cp .env.example .env
```

Important values to set:
- `DATABASE_URL` (PostgreSQL)
- `AUTH_JWT_SECRET`
- `ARIS_ADMIN_EMAIL`
- `ARIS_ADMIN_PASSWORD`
- `RUNTIME_API_URL`
- `RUNTIME_API_TOKEN`

## Quick Start

```bash
npm install
npm run prisma:migrate
npm run seed
npm run dev
```

If runtime backend is local, run `services/aris-backend` and keep `RUNTIME_API_URL` / `RUNTIME_API_TOKEN` aligned.

Default login credentials are loaded from `.env`:
- `ARIS_ADMIN_EMAIL`
- `ARIS_ADMIN_PASSWORD`

## Scripts

- `npm run dev`: start dev server (`node server.mjs`)
- `npm run build`: production build
- `npm run start`: production start
- `npm run test`: run Vitest
- `npm run lint`: run Next.js ESLint checks
- `npm run prisma:migrate`: run Prisma dev migrations
- `npm run prisma:deploy`: run Prisma deploy migrations
- `npm run seed`: seed admin user
