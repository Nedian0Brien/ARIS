# AGENTS (project)

## Operational Rules

- 사용자의 지침을 받으면 사용자의 의도에 대해서 이해한 내용을 반드시 먼저 작성한다.
- 작업 완료 이후 반드시 커밋, 푸쉬를 거친다.
- 작업 과정에서 식별한 이슈 중 대응이 필요한 이슈는 GitHub 리포지토리에 이슈를 작성하여 추가한다.
- GitHub 이슈를 생성할 때는 제목과 본문을 반드시 한글로 작성한다.
- GitHub 이슈 본문을 쉘 명령의 인라인 문자열(`gh issue create --body "..."` 등)로 직접 전달하는 것을 금지한다. 본문은 반드시 `--body-file`, 임시 파일, 또는 쉘 치환이 발생하지 않는 안전한 입력 방식으로 전달한다.
- GitHub 이슈 본문에 백틱, `$()`, 따옴표가 포함될 수 있는 경우 전송 후 반드시 `gh issue view` 등으로 본문이 깨지지 않았는지 확인한다.
- main 브랜치에 머지되더라도 배포 기준은 GitHub Actions 자동 배포가 아니라 공식 배포 스크립트다. 배포가 필요하면 `deploy/README.md` 기준으로 스크립트를 직접 실행하고, 그 결과를 사용자에게 최종 보고한다.
- 직접 배포를 수행할 때는 반드시 deploy/README.md 문서를 참고한다.
- 머지 과정에서 충돌이 발생한 경우 어떤 내용이 서로 충돌하는지 파악한 후 사용자에게 설명하고, 처리 방안 3가지를 제안한다.
- 작업이 마무리되고 나면 후속 작업 5가지를 제안한다.
- 사용자의 지침 중 확실하지 않은 부분이 있으면 작업을 진행하기 전에 사용자에게 분명히 물어본다. 이때 사용자의 의도일 가능성이 있는 최대 3가지 경우를 제시하며 사용자에게 의도를 명확히 해 달라고 요청한다.
- 코드 변경 작업은 반드시 에이전트별 전용 `git worktree`에서 독립적으로 수행한다. 현재 워킹 디렉터리에서의 직접적인 수정 작업은 엄격히 금지된다.
- 멀티 에이전트/병렬 작업뿐만 아니라 단독 작업 시에도 전용 `git worktree` 환경을 보장해야 한다.
- 동일한 워킹 디렉터리를 여러 에이전트가 공유해서 동시에 수정하는 것을 금지한다.
- 모든 작업은 시작 전 아래 표준 절차로 전용 작업 디렉터리를 생성하고, 해당 경로에서만 커밋/푸쉬를 수행한다.
- 1) 메인 체크아웃에서 `services/aris-backend/node_modules` 와 `services/aris-web/node_modules` 가 준비되어 있는지 먼저 확인한다. 없거나 필요한 dev 바이너리(`vitest`, `tsc`)가 없으면 메인 체크아웃에서 각 서비스의 의존성을 먼저 설치한다.
- 2) 새 작업 디렉터리는 `scripts/create_worktree_with_shared_node_modules.sh <worktree_path> <branch> [base_ref]` 로 생성한다. 이 스크립트를 표준 경로로 사용하며, 내부에서 `git worktree add` 이후 공유 `node_modules` 심볼릭 링크까지 연결한다.
- 3) 이미 `git worktree add` 로 만든 작업 디렉터리라면 즉시 `scripts/link_shared_node_modules.sh <worktree_path>` 를 실행해 공유 `node_modules` 를 연결한다.
- 4) 링크 이후 필요한 바이너리가 보이지 않으면 메인 체크아웃에서 의존성을 다시 설치한 뒤 `scripts/link_shared_node_modules.sh <worktree_path>` 를 다시 실행한다.
- 5) 수정, 테스트, 커밋, 푸쉬, 머지는 모두 해당 전용 `git worktree` 내부에서만 수행한다.
- 작업 완료 후 `main` 브랜치에 머지가 완료되면, 사용했던 전용 `git worktree`를 `git worktree remove <path>`로 제거하고, 작업에 사용된 로컬 및 원격 브랜치도 함께 삭제하여 환경을 청결하게 유지한다.
- 런타임 로그는 `logs/{YYYY}/{MM}/{DD}/` 경로에 저장된다. 파일명 형식: `chat-{agent}-{chatId}-{threadId}-parsed.ndjson` / `chat-{agent}-{chatId}-{threadId}-raw.ndjson`. `{agent}` 는 `gemini` | `claude` | `codex` | `unknown`.
- 특정 chatId/threadId 로그 조회: `find /home/ubuntu/project/ARIS/logs -name "*<chatId>*"` 또는 `ls logs/<YYYY>/<MM>/<DD>/ | grep <chatId>`.
- 로그 내용 확인(pretty print): `cat <파일경로> | python3 -c "import json,sys; [print(f'{o.get(\"loggedAt\",\"\")[-15:]} [{o.get(\"stage\",o.get(\"turnStatus\",\"?\"))}] {json.dumps(o.get(\"payload\",{}),ensure_ascii=False)[:120]}') for o in map(json.loads,sys.stdin)]"`

## 디버깅 가이드

> 서버/DB 내부 값을 직접 조회하려 할 때 혼선이 생기므로, 반드시 아래 공식 스크립트와 절차만 사용한다.
> 자세한 내용은 `deploy/ops/debug-runbook.md` 참조.

### 환경 구성 핵심 정보

| 항목 | 값 |
|------|-----|
| prod env 파일 | `/home/ubuntu/.config/aris/prod.env` |
| aris-backend 포트 | `4080` (PM2 cluster) |
| Happy Server 포트 | `3005` |
| 웹 Blue/Green 포트 | `3301` / `3302` |
| dev hot reload 포트 | `3305` (기본값) |
| 인증 토큰 출처 | prod.env의 `RUNTIME_API_TOKEN` |

### 공식 디버깅 스크립트

```bash
# 1) 런타임 연결 상태 확인 (토큰·헬스·인증 한 번에)
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/ops/check-runtime-connection.sh

# 2) 백엔드 헬스 체크
curl -sS http://127.0.0.1:4080/health

# 3) 세션 목록 + isRunning 상태 조회
./deploy/ops/debug-session-status.sh [sessionId] [chatId]

# 4) 최근 채팅 로그 pretty-print
./deploy/ops/debug-chat-log.sh <chatId>

# 5) 백엔드 실시간 로그
pm2 logs aris-backend --lines 120 --nostream

# 6) 웹 컨테이너 로그
docker compose --env-file /home/ubuntu/.config/aris/prod.env logs --tail=120 aris-web-blue aris-web-green

# 7) dev 서버 띄우기 (디버그 로그 확인용)
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env SKIP_DB_PREPARE=1 WEB_DEV_PORT=3305 \
  ./deploy/dev/run_web_dev_hot_reload.sh
```

### 절대 하지 말아야 할 것

- 토큰/포트를 코드에서 직접 추측해서 `curl` 날리지 않는다 → `check-runtime-connection.sh` 사용
- `runtimeStateCache`, `activeRuns` 등 인메모리 상태를 코드 읽기만으로 단정짓지 않는다 → 실제 로그/API로 검증
- Happy Server JWT 토큰(`HAPPY_SERVER_TOKEN`)을 aris-backend API 인증에 쓰지 않는다 → `RUNTIME_API_TOKEN` 사용
