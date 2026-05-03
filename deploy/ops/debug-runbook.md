# ARIS 디버깅 런북

버그를 추적할 때 혼선 없이 쓸 수 있는 공식 절차와 스크립트 모음.

---

## 환경 구성 한눈에 보기

```
[브라우저]
    ↓ HTTPS (443)
[nginx] → aris-web-blue(:3301) 또는 aris-web-green(:3302)  ← Docker Compose
    ↓ RUNTIME_API_URL=http://127.0.0.1:4080
[aris-backend] (:4080)  ← PM2 cluster, /home/ubuntu/project/ARIS/.runtime/aris-backend/
    ↓ HAPPY_SERVER_URL=http://127.0.0.1:3005
[Happy Server] (:3005)  ← 외부 런타임 (Gemini/Claude/Codex 실행)
```

### 인증 토큰 구분

| 토큰 | 환경변수 | 용도 |
|------|---------|------|
| `RUNTIME_API_TOKEN` | prod.env, aris-backend/.env | aris-web → aris-backend API 호출 |
| `HAPPY_SERVER_TOKEN` | prod.env, aris-backend/.env | aris-backend → Happy Server 호출 |

> **주의**: 두 토큰은 다를 수 있다. `check-runtime-connection.sh`가 정렬 여부를 검증해 준다.

---

## 공식 스크립트

### 1. 전체 연결 상태 확인

```bash
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/ops/check-runtime-connection.sh
```

검증 항목: 토큰 일치 여부 · backend `/health` · 인증 없는 접근 차단 · 인증된 세션 목록 조회

### 2. 세션/채팅 isRunning 상태 조회

```bash
# 전체 세션 목록
./deploy/ops/debug-session-status.sh

# 특정 세션
./deploy/ops/debug-session-status.sh <sessionId>

# 특정 세션+채팅 (isRunning 포함)
./deploy/ops/debug-session-status.sh <sessionId> <chatId>
```

### 3. 채팅 로그 pretty-print

```bash
# chatId로 오늘 로그 자동 검색
./deploy/ops/debug-chat-log.sh <chatId>

# 특정 날짜
./deploy/ops/debug-chat-log.sh <chatId> 2026/03/16
```

### 4. 백엔드 실시간 로그

```bash
pm2 logs aris-backend --lines 200 --nostream   # 최근 200줄
pm2 logs aris-backend                          # 스트리밍
```

### 5. 웹 컨테이너 로그

```bash
docker compose --env-file /home/ubuntu/.config/aris/prod.env \
  logs --tail=200 aris-web-blue aris-web-green
```

### 6. dev 서버로 브라우저 콘솔 로그 확인

프론트엔드 클라이언트 로그(`console.log`)는 브라우저 콘솔에만 찍힌다.
디버그 로그를 코드에 심은 뒤 dev 서버를 띄워서 브라우저에서 직접 확인한다.

```bash
# worktree에서 실행
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env \
  SKIP_DB_PREPARE=1 \
  WEB_DEV_AUTO_PORT=1 \
  ./deploy/dev/run_web_dev_hot_reload.sh
```

→ 스크립트가 출력하는 `https://lawdigest.cloud/proxy/<port>/` URL로 접속 후 브라우저 DevTools > Console 탭 확인.

---

## 자주 하는 실수

| 실수 | 올바른 방법 |
|------|------------|
| 토큰을 코드에서 추측해서 curl | `check-runtime-connection.sh` 실행 후 출력된 토큰/URL 사용 |
| 3005(Happy Server)에 aris-backend API 호출 | 4080(aris-backend)에 호출 |
| Happy Server JWT를 aris-backend 인증에 사용 | `RUNTIME_API_TOKEN` 사용 |
| 인메모리 상태(activeRuns 등)를 코드 읽기로 단정 | 실제 API(`/v1/sessions/{id}/runtime`) 또는 로그로 검증 |
| 클라이언트 `console.log`를 서버 로그에서 찾기 | dev 서버 + 브라우저 DevTools 사용 |

---

## 재배포 중 런타임 연속성 검증

백엔드가 PM2 reload 되는 동안 진행 중인 에이전트 run이 유지되는지 확인할 때는 아래 순서를 사용한다.

```bash
# 1) 대상 세션/채팅의 isRunning 확인
./deploy/ops/debug-session-status.sh <sessionId> <chatId>

# 2) 같은 시점에 백엔드 reload 수행
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env \
  ARIS_BACKEND_DRAIN_TIMEOUT_MS=600000 \
  ./deploy/deploy_backend_zero_downtime.sh

# 3) reload 직후에도 isRunning 유지되는지 재확인
./deploy/ops/debug-session-status.sh <sessionId> <chatId>

# 4) permission 승인/abort/retry 후 로그에서 후속 이벤트 확인
pm2 logs aris-backend --lines 200 --nostream
./deploy/ops/debug-chat-log.sh <chatId>
```

체크 포인트:
- reload 직후에도 `isRunning=true` 가 유지되어야 한다.
- pending permission을 승인하면 old worker가 결정을 받아 turn이 계속 진행되어야 한다.
- `abort` 또는 disconnected-chat `retry` 요청은 DB에 기록된 뒤 active run/new worker에 반영되어야 한다.

---

## 로그 파일 위치 및 형식

```
logs/{YYYY}/{MM}/{DD}/
  chat-{agent}-{chatId}-{threadId}-parsed.ndjson   ← 파싱된 구조화 로그
  chat-{agent}-{chatId}-{threadId}-raw.ndjson      ← 원시 줄 로그
```

`{agent}`: `gemini` | `claude` | `codex` | `unknown`

```bash
# chatId로 로그 파일 찾기
find /home/ubuntu/project/ARIS/logs -name "*<chatId>*"

# pretty-print
cat <파일경로> | python3 -c "
import json,sys
for o in map(json.loads,sys.stdin):
    ts = o.get('loggedAt','')[-15:]
    stage = o.get('stage', o.get('turnStatus','?'))
    payload = json.dumps(o.get('payload',{}), ensure_ascii=False)[:120]
    print(f'{ts} [{stage}] {payload}')
"
```
