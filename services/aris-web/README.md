# ARIS Web

Next.js 15 App Router implementation for ARIS phase-1.

## Features included

- JWT login/logout and role-aware session guards
- Runtime dashboard and session detail (read-only)
- Response type renderer (`text_reply`, `command_execution`, `code_read`, `code_write`)
- Intent composer, permission center, and operator session actions (`abort/retry/kill/resume`)
- Mobile quick actions for permission and session controls
- Operator-only SSH fallback command link issuance with audit logs
- Prisma models for users, sessions, and audit logs

## Quick start

1. Copy environment file.

```bash
cp .env.example .env
```

2. Install dependencies.

```bash
npm install
```

3. Run database migration and seed admin user.

```bash
npm run prisma:migrate
npm run seed
```

4. Start dev server.

```bash
npm run dev
```

Default login credentials come from `.env` (`ARIS_ADMIN_EMAIL`, `ARIS_ADMIN_PASSWORD`).
