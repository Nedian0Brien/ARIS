<div align="center">

# ARIS

**A runtime interface for operating agentic coding sessions through a chat-first workspace**

![Next.js 15](https://img.shields.io/badge/Next.js_15-000000?style=flat-square&logo=nextdotjs&logoColor=white) ![React 19](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=white) ![Fastify](https://img.shields.io/badge/Fastify-000000?style=flat-square&logo=fastify&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)

[한국어](./README.md)

</div>

---

## Overview

ARIS, the Agentic Runtime Interface System, is a monorepo for turning Codex, Claude, Gemini, and related agent runtimes into an operator-friendly chat workspace.

The web app provides session lists, conversation streams, command cards, file read/write cards, permission approval, and runtime actions such as abort, retry, kill, and resume. The backend exposes session, message, permission, and runtime state APIs, then normalizes provider-specific raw events into a shared action-card contract.

The goal is to move agent work out of terminal-only visibility and into an interface with login, authorization, audit logs, and cross-device UI.

## Highlights

| Area | Description |
|---|---|
| Chat-first session workspace | Users issue instructions, review results, approve work, abort runs, and retry sessions inside per-session chat views. |
| Runtime event rendering | `text_reply`, command execution, file read/write, docker, and git events are rendered as typed cards. |
| Permission center | Sensitive actions flow through operator decisions such as `allow once`, `allow session`, and `deny`. |
| Provider runtime bridge | Codex, Claude, and Gemini streams are mapped into common session, message, and action contracts. |
| Auth and audit baseline | JWT login, operator/viewer roles, and Prisma-backed user, audit, and chat metadata are included. |
| Production deploy scripts | Web blue/green Docker slots, backend PM2 reload, and nginx upstream switching are handled by official scripts. |

## Repository Structure

| Path | Role |
|---|---|
| `services/aris-web/` | Next.js 15 App Router operator/viewer UI |
| `services/aris-backend/` | Fastify runtime API, session/message/permission provider bridge |
| `deploy/` | Production/dev deployment, nginx, PM2, and operational check scripts |
| `docs/` | Product intent, experience design, architecture, security model, and MVP specs |
| `scripts/` | Worktree and runtime log helper scripts |

## Quick Start

### 1. Prepare environment files

```bash
cp services/aris-backend/.env.example services/aris-backend/.env
cp services/aris-web/.env.example services/aris-web/.env
```

Keep the runtime token aligned across both services.

```text
services/aris-backend/.env: RUNTIME_API_TOKEN=...
services/aris-web/.env:     RUNTIME_API_URL=http://localhost:4080
services/aris-web/.env:     RUNTIME_API_TOKEN=...
```

### 2. Install dependencies

```bash
npm --prefix services/aris-backend install
npm --prefix services/aris-web install
```

### 3. Prepare the web database

```bash
npm --prefix services/aris-web run prisma:migrate
npm --prefix services/aris-web run seed
```

### 4. Run development servers

```bash
npm --prefix services/aris-backend run dev
npm --prefix services/aris-web run dev
```

Default ports are backend `4080` and web `3000`.

## Verification

| Check | Command |
|---|---|
| Web test | `npm --prefix services/aris-web test` |
| Web build | `npm --prefix services/aris-web run build` |
| Backend test | `npm --prefix services/aris-backend test` |
| Backend typecheck | `npm --prefix services/aris-backend run typecheck` |
| Backend build | `npm --prefix services/aris-backend run build` |
| Mobile overflow e2e | `npm --prefix services/aris-web run test:e2e:mobile-overflow` |

## Deployment Notes

ARIS production deploys are driven by scripts under `deploy/`, not by a main-branch push alone.

| Target | Baseline |
|---|---|
| Production web | Docker Compose blue/green slots behind nginx |
| Production backend | Host PM2 cluster reload |
| Production URL | `https://aris.lawdigest.cloud` |
| Dev proxy | `https://lawdigest.cloud/proxy/<port>/` |

Standard entrypoints:

```bash
mkdir -p /home/ubuntu/.config/aris
cp deploy/.env.example /home/ubuntu/.config/aris/prod.env
export DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env

./deploy/deploy_backend_zero_downtime.sh
./deploy/deploy_web.sh
./deploy/deploy_zero_downtime.sh
```

Report a production deployment only after the target URL has been smoke-tested. A GitHub branch push is not a production deployment by itself.

## Documentation

| Document | What it covers |
|---|---|
| `docs/README.md` | Documentation map and recommended reading order |
| `docs/03-platform/01-system-architecture.md` | Service layout, API flow, and deployment baseline |
| `docs/03-platform/02-security-model.md` | Auth, permissions, audit logs, and SSH fallback policy |
| `docs/04-delivery/01-mvp-feature-spec.md` | MVP features and acceptance criteria |
| `deploy/README.md` | Production/dev deployment and operational checks |
| `services/aris-web/README.md` | Web app features, env vars, and scripts |
| `services/aris-backend/README.md` | Runtime API, provider mapping, and token wiring |

## Documentation Sources

This README was updated from the following repository files.

- `README.md`
- `services/aris-web/README.md`
- `services/aris-backend/README.md`
- `services/aris-web/package.json`
- `services/aris-backend/package.json`
- `docs/README.md`
- `docs/03-platform/01-system-architecture.md`
- `docs/04-delivery/01-mvp-feature-spec.md`
- `deploy/README.md`
