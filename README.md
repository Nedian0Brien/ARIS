# ARIS

Agentic Runtime Interface System monorepo.

ARIS provides:
- `aris-web`: Next.js operator/viewer UI (chat-first workflow, auth, permissions)
- `aris-backend`: Fastify runtime API for sessions/messages/actions
- `deploy`: zero-downtime deployment scripts (backend PM2 + web blue/green)

## Repository Layout

```text
.
├── services/
│   ├── aris-web/       # Next.js 15 app + Prisma
│   └── aris-backend/   # Fastify runtime backend
├── deploy/             # Deploy scripts/env/templates
├── docs/               # Product/architecture/security docs
└── .github/workflows/  # CI/CD workflows
```

## Prerequisites

- Node.js 22+
- npm
- PostgreSQL (for `aris-web`)
- Optional for production deploy: Docker, PM2, nginx

## Local Development (Recommended Flow)

1. Configure backend env.

```bash
cp services/aris-backend/.env.example services/aris-backend/.env
```

2. Configure web env.

```bash
cp services/aris-web/.env.example services/aris-web/.env
```

3. Install dependencies.

```bash
npm --prefix services/aris-backend install
npm --prefix services/aris-web install
```

4. Prepare database for `aris-web` and create admin user.

```bash
npm --prefix services/aris-web run prisma:migrate
npm --prefix services/aris-web run seed
```

5. Start backend and web.

```bash
npm --prefix services/aris-backend run dev
npm --prefix services/aris-web run dev
```

## Worktree Helper

If you use dedicated `git worktree` directories, you can reuse the main
checkout's installed dependencies instead of running `npm install` in every
worktree.

Create a new worktree and auto-link shared `node_modules`:

```bash
scripts/create_worktree_with_shared_node_modules.sh .worktrees/my-task feat/my-task
```

Link shared `node_modules` into an already existing worktree:

```bash
scripts/link_shared_node_modules.sh /absolute/path/to/worktree
```

Default ports:
- Web: `3000`
- Backend: `4080`

## Deployment

- Main push runs `.github/workflows/deploy-on-main.yml`.
- Official deployment entrypoints:
  - `deploy/deploy_backend_zero_downtime.sh`
  - `deploy/deploy_web.sh`
  - `deploy/deploy_zero_downtime.sh`
- Operational helpers live under:
  - `deploy/ops/`
  - `deploy/dev/`
  - `deploy/legacy/`
- Detailed operations guide: [`deploy/README.md`](deploy/README.md)

## Service Docs

- [`services/aris-web/README.md`](services/aris-web/README.md)
- [`services/aris-backend/README.md`](services/aris-backend/README.md)
- [`docs/README.md`](docs/README.md)
