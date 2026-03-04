# 04-배포 가이드

## 목표
- 배포 과정의 실수로 인한 **401 Unauthorized**, 서비스 미반영, 연결 불일치 이슈를 최소화한다.
- 웹, DB, 백엔드의 상태를 배포 후 일관되게 확인한다.
- 문제 발생 시 원인 진단 순서를 표준화한다.

## 배포 구성도
- `aris-backend`: 호스트에서 `pm2`로 실행 (기본 포트 `4080`)
- `aris-web`: `Docker Compose`(`aris-stack-aris-web`)로 실행 (기본 포트 `3300`로 노출)
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
   - 토큰 변경 시 백엔드는 **반드시 재시작**해야 한다.

## 1. 백엔드 배포(필수 선행)
```bash
cd services/aris-backend
npm install
npm run build
pm2 start deploy/ecosystem.config.cjs --env production
```

이미 실행 중이면 아래로 재시작:

```bash
pm2 restart aris-backend --update-env
```

## 2. 웹/DB 배포
```bash
cd /path/to/web-agentic-coding
docker compose --env-file deploy/.env up -d --build aris-web
```

도메인 운영 시:

```bash
docker compose --env-file deploy/.env --profile edge up -d --build
```

## 3. 배포 후 즉시 헬스체크
```bash
docker compose --env-file deploy/.env ps aris-web
docker compose --env-file deploy/.env logs --tail=120 aris-web
docker compose --env-file deploy/.env logs --tail=120 aris-backend
```

예상 동작
- `aris-stack-aris-web-1` 상태가 `healthy`로 전환
- 웹이 `http://localhost:3300`에서 응답
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
2. 백엔드 재시작 누락(`pm2 restart --update-env` 미실행)
3. 호스트 네트워크/URL 변경(`HAPPY_SERVER_URL`)로 백엔드 URL을 잘못 가리킴
4. 브라우저/API 캐시로 구 버전 화면이 노출되어 오류 메시지가 오래 보임

해결 순서
1. 토큰 파일 동기화
2. 백엔드 재시작
3. `./deploy/check-runtime-connection.sh` 재실행
4. 웹 로그에서 실제 응답 코드 확인

### B. 배포했는데 반영이 안 된 것처럼 보임
1. 브라우저에서 강제 새로고침(Ctrl/Cmd + Shift + R)
2. 시크릿 창에서 재확인
3. 프록시(Caddy/nginx) 캐시 또는 서비스워커 캐시 존재 여부 확인
4. 실제 실행 컨테이너가 새 이미지인지 확인
   - `docker image ls | rg aris-stack-aris-web`
   - `docker ps --filter name=aris-stack-aris-web-1`

### C. 세션이 비어 있는데 더미 데이터가 노출되는 것처럼 보임
- 현재 코드는 백엔드 세션 응답에 의존한다.
- 세션이 없다면 UI는 빈 상태 메시지를 출력해야 하며, 임의 더미 데이터가 표시되지 않음.
- 이 동작은 서버/클라이언트에서 모두 동일해야 하므로, 배포 직후 빈 상태 화면을 직접 확인한다.

## 6. 일반적인 운영 커맨드
```bash
docker compose --env-file deploy/.env up -d --build            # 전체 서비스 재기동

docker compose --env-file deploy/.env ps                        # 상태 확인
docker compose --env-file deploy/.env logs -f aris-web aris-backend # 실시간 로그
docker compose --env-file deploy/.env down                      # 스택 중지
```

## 7. 배포 완료 체크리스트
- `git` 배포 커밋/브랜치 확정
- 토큰 동기화 완료
- `pm2` 백엔드 프로세스 정상
- `aris-web` 컨테이너 `healthy`
- `check-runtime-connection.sh` 통과
- `http://localhost:3300` 로그인 후 세션 목록/첫 진입 화면 확인
- 운영자 계정 로그인/권한 동작 확인
