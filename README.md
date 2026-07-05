<div align="center">

# ARIS

**에이전틱 코딩 세션을 채팅형 워크스페이스로 운영하는 런타임 인터페이스**

![Next.js 15](https://img.shields.io/badge/Next.js_15-000000?style=flat-square&logo=nextdotjs&logoColor=white) ![React 19](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=white) ![Fastify](https://img.shields.io/badge/Fastify-000000?style=flat-square&logo=fastify&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)

[English](./README.en.md)

</div>

---

## 소개

ARIS(Agentic Runtime Interface System)는 Codex, Claude, Gemini 같은 에이전트 런타임을 사용자가 읽고 제어할 수 있는 채팅형 작업 공간으로 감싸는 모노레포입니다.

웹 앱은 세션 목록, 대화 스트림, 명령 실행 카드, 파일 읽기/쓰기 카드, 권한 승인, 세션 중단/재시도/재개 같은 operator 행동을 제공합니다. 백엔드는 세션, 메시지, 권한, 런타임 상태를 API로 노출하고 provider별 raw event를 공통 action card 계약으로 정규화합니다.

이 저장소의 목표는 "터미널 안에서만 보이는 에이전트 작업"을 로그인, 권한, 감사 로그, 모바일 대응 UI가 있는 운영 가능한 인터페이스로 옮기는 것입니다.

## 주요 기능

| 기능 | 설명 |
|---|---|
| Chat-first session workspace | 사용자는 세션별 대화 화면에서 지시, 결과 확인, 승인, 중단, 재시도를 수행합니다. |
| Runtime event rendering | `text_reply`, command execution, file read/write, docker/git 실행 같은 이벤트를 타입별 카드로 렌더링합니다. |
| Permission center | 민감 작업은 operator가 `allow once`, `allow session`, `deny` 흐름으로 판단합니다. |
| Provider runtime bridge | Codex, Claude, Gemini stream을 공통 session/message/action contract로 맞춥니다. |
| Auth and audit baseline | JWT 로그인, operator/viewer 권한, Prisma 기반 사용자·감사·채팅 메타데이터를 사용합니다. |
| Production deploy scripts | web blue/green Docker slot, backend PM2 reload, nginx upstream switch를 공식 스크립트로 운영합니다. |

## 저장소 구조

| 경로 | 역할 |
|---|---|
| `services/aris-web/` | Next.js 15 App Router 기반 operator/viewer UI |
| `services/aris-backend/` | Fastify 기반 runtime API, session/message/permission provider bridge |
| `deploy/` | production/dev 배포, nginx, PM2, 운영 점검 스크립트 |
| `docs/` | 사용자 의도, 경험 설계, 시스템 아키텍처, 보안 모델, MVP 스펙 |
| `scripts/` | worktree와 runtime log 조회 보조 스크립트 |

## 빠른 시작

### 1. 환경 파일 준비

```bash
cp services/aris-backend/.env.example services/aris-backend/.env
cp services/aris-web/.env.example services/aris-web/.env
```

두 서비스의 runtime token은 서로 맞아야 합니다.

```text
services/aris-backend/.env: RUNTIME_API_TOKEN=...
services/aris-web/.env:     RUNTIME_API_URL=http://localhost:4080
services/aris-web/.env:     RUNTIME_API_TOKEN=...
```

### 2. 의존성 설치

```bash
npm --prefix services/aris-backend install
npm --prefix services/aris-web install
```

### 3. 웹 DB 준비

```bash
npm --prefix services/aris-web run prisma:migrate
npm --prefix services/aris-web run seed
```

### 4. 개발 서버 실행

```bash
npm --prefix services/aris-backend run dev
npm --prefix services/aris-web run dev
```

기본 포트는 backend `4080`, web `3000`입니다.

## 검증

| 항목 | 명령 |
|---|---|
| Web test | `npm --prefix services/aris-web test` |
| Web build | `npm --prefix services/aris-web run build` |
| Backend test | `npm --prefix services/aris-backend test` |
| Backend typecheck | `npm --prefix services/aris-backend run typecheck` |
| Backend build | `npm --prefix services/aris-backend run build` |
| Mobile overflow e2e | `npm --prefix services/aris-web run test:e2e:mobile-overflow` |

## 배포 메모

ARIS의 production 배포는 main push가 아니라 `deploy/` 스크립트를 기준으로 합니다.

| 대상 | 기준 |
|---|---|
| Production web | Docker Compose blue/green slot 뒤의 nginx upstream |
| Production backend | Host PM2 cluster reload |
| Production URL | `https://aris.lawdigest.cloud` |
| Dev proxy | `https://lawdigest.cloud/proxy/<port>/` |

표준 entrypoint는 다음과 같습니다.

```bash
mkdir -p /home/ubuntu/.config/aris
cp deploy/.env.example /home/ubuntu/.config/aris/prod.env
export DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env

./deploy/deploy_backend_zero_downtime.sh
./deploy/deploy_web.sh
./deploy/deploy_zero_downtime.sh
```

배포 완료를 보고하려면 대상 URL을 실제로 smoke test해야 합니다. GitHub branch push만으로는 production deploy가 완료된 것이 아닙니다.

## 문서

| 문서 | 내용 |
|---|---|
| `docs/README.md` | 전체 문서 맵과 권장 읽기 순서 |
| `docs/03-platform/01-system-architecture.md` | 서비스 구성, API 흐름, 배포 기준 |
| `docs/03-platform/02-security-model.md` | 인증, 권한, 감사 로그, SSH fallback 보안 정책 |
| `docs/04-delivery/01-mvp-feature-spec.md` | MVP 기능과 수용 기준 |
| `deploy/README.md` | production/dev 배포와 운영 점검 절차 |
| `services/aris-web/README.md` | 웹 앱 기능, 환경 변수, 실행 스크립트 |
| `services/aris-backend/README.md` | runtime API, provider mapping, token wiring |

## 문서 작성 근거

이 README는 저장소 안의 다음 파일을 기준으로 갱신했습니다.

- `README.md`
- `services/aris-web/README.md`
- `services/aris-backend/README.md`
- `services/aris-web/package.json`
- `services/aris-backend/package.json`
- `docs/README.md`
- `docs/03-platform/01-system-architecture.md`
- `docs/04-delivery/01-mvp-feature-spec.md`
- `deploy/README.md`
