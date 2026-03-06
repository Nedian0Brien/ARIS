# 04-배포 가이드

## 목표
- 배포 과정의 실수로 인한 **401 Unauthorized**, 서비스 미반영, 연결 불일치 이슈를 최소화한다.
- 웹, DB, 백엔드의 상태를 배포 후 일관되게 확인한다.
- 문제 발생 시 원인 진단 순서를 표준화한다.

## 배포 구성도
- `aris-backend`: 호스트에서 `pm2`로 실행 (기본 포트 `4080`)
- `aris-web`: `Docker Compose` blue/green 슬롯(`aris-web-blue`, `aris-web-green`)으로 무중단 배포
- `postgres`: Docker Compose 내부 DB
- 프록시(옵션): `caddy` 프로파일

## 0. 배포 전 점검 (필수)
1. 코드 브랜치/커밋 확인
   - `git status --short`
   - `git rev-parse --short HEAD`
   - 배포 브랜치가 기대 브랜치(`main`)인지 확인

2. 환경변수 정합성(중요)
   - `deploy/.env`와 `services/aris-backend/.env`의 `RUNTIME_API_TOKEN`이 일치해야 한다.
   - `AUTH_JWT_SECRET`, `ARIS_ADMIN_EMAIL`, `ARIS_ADMIN_PASSWORD`, `POSTGRES_PASSWORD`가 값이 채워져 있는지 확인한다.
   - `HOST_PROJECTS_ROOT`는 실제 호스트 프로젝트 경로와 일치해야 한다.

3. 백엔드 토큰 반영 확인
   - 토큰 변경 시 백엔드는 **반드시 reload**해야 한다.

## 1. 백엔드 배포(필수 선행)
```bash
cd /path/to/web-agentic-coding
./deploy/deploy_backend_zero_downtime.sh
```

## 2. 웹/DB 배포
```bash
cd /path/to/web-agentic-coding
./deploy/deploy_web.sh
```

통합 배포(백엔드 + 웹):

```bash
./deploy/deploy_zero_downtime.sh
```

`deploy_web.sh` 기본 정책
- `DOCKER_BUILDKIT=1` + `COMPOSE_DOCKER_CLI_BUILD=1`
- 비활성 슬롯(`aris-web-blue` 또는 `aris-web-green`) 빌드 후 기동
- 컨테이너 health + HTTP readiness 확인 후 nginx upstream 스위치
- 짧은 드레인 후 이전 슬롯 중지

운영 환경별 옵션 예시
```bash
WEB_DRAIN_SECONDS=12 ./deploy/deploy_web.sh
PULL_BASE=1 ./deploy/deploy_web.sh
SKIP_BUILD_IF_UNCHANGED=0 ./deploy/deploy_web.sh
```

중요 운영 원칙
- 웹 배포는 `./deploy/deploy_web.sh` 또는 `./deploy/deploy_zero_downtime.sh`만 사용한다.
- `docker compose ... up -d --build aris-web`는 레거시 단일 슬롯(`3300`)만 갱신하므로, 무중단 슬롯 라우팅 환경에서는 "배포했는데 반영 안 됨" 현상의 원인이 된다.

## 3. 배포 후 즉시 헬스체크
```bash
docker compose --env-file deploy/.env ps aris-web-blue aris-web-green
docker compose --env-file deploy/.env logs --tail=120 aris-web-blue aris-web-green
pm2 logs aris-backend --lines 120 --nostream
curl -sS http://127.0.0.1:4080/health
cat deploy/.state/aris-web.active-slot
sudo cat /etc/nginx/snippets/aris-web-upstream.conf
```

예상 동작
- 활성 슬롯 컨테이너가 `healthy` 상태
- `deploy/.state/aris-web.active-slot` 값과 nginx upstream 포트가 같은 슬롯을 가리킴
- 백엔드가 `POST /v1/sessions` 등 인증된 경로에서 401/200 정책을 준수

## 4. 런타임 인증 연동 검증(권장)
아래 스크립트를 실행해 토큰/연결 상태를 한 번에 확인한다.

```bash
./deploy/check-runtime-connection.sh
```

체크 항목
- `deploy/.env`와 `services/aris-backend/.env` 토큰 동일 여부
- `backend /health`
- 토큰 없을 때 `/v1/sessions`가 `401`
- 배포 토큰으로 `/v1/sessions`가 `200`

## 5. 배포 실패/이슈 트러블슈팅

### A. `백엔드 응답 오류 (401): Unauthorized`
원인 우선순위
1. `deploy/.env`와 `services/aris-backend/.env`의 `RUNTIME_API_TOKEN` 불일치
2. 백엔드 reload 누락(`deploy_backend_zero_downtime.sh` 미실행)
3. 호스트 네트워크/URL 변경(`HAPPY_SERVER_URL`)로 백엔드 URL을 잘못 가리킴
4. 브라우저/API 캐시로 구 버전 화면이 노출되어 오류 메시지가 오래 보임

해결 순서
1. 토큰 파일 동기화
2. 백엔드 reload
3. `./deploy/check-runtime-connection.sh` 재실행
4. 웹 로그에서 실제 응답 코드 확인

### B. 배포했는데 반영이 안 된 것처럼 보임
1. 브라우저에서 강제 새로고침(Ctrl/Cmd + Shift + R)
2. 시크릿 창에서 재확인
3. 활성 슬롯과 nginx 업스트림이 일치하는지 확인
   - `cat deploy/.state/aris-web.active-slot`
   - `sudo cat /etc/nginx/snippets/aris-web-upstream.conf`
4. 레거시 `aris-web` 컨테이너가 실행 중인지 확인
   - `docker compose --env-file deploy/.env ps aris-web`
5. 실제 실행 컨테이너가 새 이미지인지 확인
   - `docker image ls | rg aris-stack-aris-web`
   - `docker ps --filter name=aris-stack-aris-web-blue`
   - `docker ps --filter name=aris-stack-aris-web-green`
6. 필요 시 슬롯 재배포로 라우팅/컨테이너 상태를 정렬
   - `STOP_LEGACY_WEB=1 ./deploy/deploy_web.sh`

### C. 세션이 비어 있는데 더미 데이터가 노출되는 것처럼 보임
- 현재 코드는 백엔드 세션 응답에 의존한다.
- 세션이 없다면 UI는 빈 상태 메시지를 출력해야 하며, 임의 더미 데이터가 표시되지 않음.
- 이 동작은 서버/클라이언트에서 모두 동일해야 하므로, 배포 직후 빈 상태 화면을 직접 확인한다.

## 6. 일반적인 운영 커맨드
```bash
docker compose --env-file deploy/.env up -d --build            # 전체 서비스 재기동
./deploy/deploy_web.sh                                          # 웹 무중단(blue/green) 배포
./deploy/deploy_backend_zero_downtime.sh                        # 백엔드 무중단 reload 배포
./deploy/deploy_zero_downtime.sh                                # 백엔드+웹 통합 무중단 배포

docker compose --env-file deploy/.env ps                        # 상태 확인
docker compose --env-file deploy/.env logs -f aris-web-blue aris-web-green # 웹 로그
pm2 logs aris-backend                                            # 백엔드 로그
docker compose --env-file deploy/.env down                      # 스택 중지
docker system df -v                                              # 디스크 사용량 점검
```

## 7. 배포 완료 체크리스트
- `git` 배포 커밋/브랜치 확정
- 토큰 동기화 완료
- `pm2` 백엔드 프로세스 정상
- 활성 슬롯 컨테이너 `healthy`
- `active-slot` 파일과 nginx upstream 포트 일치
- `check-runtime-connection.sh` 통과
- `http://localhost:3300` 로그인 후 세션 목록/첫 진입 화면 확인
- 운영자 계정 로그인/권한 동작 확인

## 8. 리소스 영향(무중단 기준)
- 웹(blue/green): 배포 중 짧은 구간에만 슬롯 2개가 동시에 떠서 웹 메모리 사용량이 일시적으로 증가한다.
- 백엔드(PM2 cluster): `ARIS_BACKEND_INSTANCES=2` 이상이면 상시 다중 워커 메모리를 사용한다.
- 권장: 운영 메모리 계획은 "평시 + 웹 배포 중 추가 슬롯 + 백엔드 추가 워커"를 합산해 잡는다.
