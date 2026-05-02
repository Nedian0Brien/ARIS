# 06-배포 대상 기준

이 문서는 "배포했다"는 말을 어떤 URL과 런타임에 대해 사용할지 정한다. ARIS는 운영 도메인, code-server proxy dev 서버, 임시 preview 포트가 함께 쓰이므로 대상 URL을 먼저 분류해야 한다.

## 한 줄 원칙

- 사용자가 정확한 URL을 제시하면 그 URL이 기준이다.
- URL이 없고 "배포"라고만 말하면 운영 배포를 뜻한다.
- `main` push는 배포가 아니다.
- `lawdigest.cloud/proxy/<port>/`는 운영 배포가 아니라 dev proxy 반영이다.
- 완료 보고에는 반드시 검증한 URL, 커밋, 실행 런타임을 함께 적는다.

## 대상 분류

| 이름 | 대표 URL | 런타임 | 표준 목적 | 완료 표현 |
| --- | --- | --- | --- | --- |
| Production | `https://aris.lawdigest.cloud` | Docker blue/green + nginx | 실제 운영 반영 | "프로덕션 배포 완료" |
| Dev proxy | `https://lawdigest.cloud/proxy/<port>/` | 로컬 Next dev 서버 | 개발 중 화면 확인 | "`<port>` dev proxy 반영 완료" |
| Local slot | `http://127.0.0.1:3301`, `3302` | 운영 blue/green 슬롯 | 운영 배포 내부 헬스체크 | "슬롯 헬스체크 통과" |
| GitHub branch | GitHub 원격 브랜치 | 없음 | 코드 공유/리뷰 | "푸시 완료" |

## Production 기준

운영 웹 배포는 아래 명령만 표준이다.

```bash
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/deploy_web.sh
```

운영 전체 배포는 아래 명령만 표준이다.

```bash
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/deploy_zero_downtime.sh
```

운영 배포 완료라고 말하려면 최소한 아래를 확인한다.

```bash
docker compose --env-file /home/ubuntu/.config/aris/prod.env ps aris-web-blue aris-web-green
curl -sS http://127.0.0.1:4080/health
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/ops/check-runtime-connection.sh
curl -sS -I https://aris.lawdigest.cloud/login
```

사용자가 특정 운영 화면 URL을 줬다면, 로그인 후 그 정확한 URL에서 DOM 또는 사용자 행동을 확인한다. 루트나 로그인 페이지만 확인하고 기능 배포를 완료했다고 말하지 않는다.

## Dev proxy 기준

`https://lawdigest.cloud/proxy/<port>/`는 code-server가 로컬 포트를 외부에서 볼 수 있게 프록시한 개발용 주소다. 운영 blue/green 배포를 해도 이 URL은 바뀌지 않는다.

dev proxy 반영은 아래 명령으로 해당 포트의 dev 서버를 의도한 체크아웃에서 다시 띄우는 것이다.

```bash
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env SKIP_DB_PREPARE=1 WEB_DEV_PORT=3309 \
  ./deploy/dev/run_web_dev_hot_reload.sh
```

dev proxy 완료라고 말하려면 최소한 아래를 확인한다.

```bash
lsof -nP -iTCP:3309 -sTCP:LISTEN
readlink -f /proc/<pid>/cwd
git -C "$(readlink -f /proc/<pid>/cwd)/../.." rev-parse --short HEAD
```

그리고 사용자가 본 정확한 URL에서 smoke를 수행한다.

```bash
https://lawdigest.cloud/proxy/3309/?tab=project&project=<id>&view=chat&chat=<id>
```

## URL별 행동 규칙

| 사용자가 말한 대상 | 먼저 할 일 | 하지 말 것 |
| --- | --- | --- |
| `https://aris.lawdigest.cloud/...` | 운영 배포 또는 운영 smoke | dev proxy만 보고 완료 선언 |
| `https://lawdigest.cloud/proxy/<port>/...` | 해당 포트 프로세스 cwd/commit 확인 | production deploy만 하고 완료 선언 |
| `http://127.0.0.1:<port>/...` | 로컬 포트의 프로세스 확인 | 외부 URL과 동일하다고 가정 |
| URL 없이 "배포" | production 기준으로 진행 | 임의 dev port 선택 |
| "프리뷰", "개발 서버" | dev proxy 기준으로 진행 | 운영 nginx 전환 |

## 완료 보고 템플릿

Production:

```text
프로덕션 배포 완료
- commit: <sha>
- active slot: <blue|green> (<port>)
- checked URL: https://aris.lawdigest.cloud/<path>
- checks: docker ps healthy, backend /health 200, runtime auth OK, smoke OK
```

Dev proxy:

```text
3309 dev proxy 반영 완료
- commit: <sha>
- process cwd: <path>
- checked URL: https://lawdigest.cloud/proxy/3309/<path>
- checks: port listener OK, exact URL smoke OK
```

## 이번 혼선의 재발 방지

`https://aris.lawdigest.cloud`에 배포된 코드와 `https://lawdigest.cloud/proxy/3309/`에서 보이는 코드는 서로 다른 프로세스일 수 있다. `3309`가 오래된 worktree에서 떠 있으면 production이 최신이어도 proxy 화면은 예전 UI를 계속 보여준다.

따라서 proxy URL을 받은 작업은 항상 아래 순서로 시작한다.

1. `lsof -nP -iTCP:<port> -sTCP:LISTEN`
2. `readlink -f /proc/<pid>/cwd`
3. 해당 cwd의 `git rev-parse --short HEAD`
4. 필요한 경우 기존 프로세스 종료 후 의도한 체크아웃에서 `run_web_dev_hot_reload.sh` 재시작
5. 정확한 proxy URL에서 smoke
