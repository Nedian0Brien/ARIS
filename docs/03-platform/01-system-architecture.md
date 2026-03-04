# ARIS System Architecture

## 1. 아키텍처 원칙

- ARIS는 `services` 디렉토리의 독립 서비스로 운영한다.
- `references`는 참고자료이며 런타임 의존성에 포함하지 않는다.
- 웹 클라이언트는 채팅형 워크스페이스 UX에 집중한다.
- 민감 액션은 인증/권한/감사 계층을 통과해야 한다.

## 2. 구성 요소

1. `services/aris-web`
- Next.js 기반 웹 클라이언트
- 인증, UI 렌더링, 액션 API 프록시
- **구동**: Docker 컨테이너

2. `services/aris-backend`
- 세션/메시지/권한/액션 API
- 에이전트 런타임 데이터 소스 역할
- **구동**: Host OS (PM2/Node.js) 직접 구동
- **특징**: 호스트 파일 시스템, Nginx 설정, `systemctl` 등 OS 레벨 제어권 보유

3. `postgres`
- 계정/감사로그/서비스 데이터 저장
- **구동**: Docker 컨테이너

4. `nginx` + domain
- TLS 종단 및 리버스 프록시

5. SSH fallback path
- 권한 사용자 대상 예외 조치 경로

## 3. 핵심 API 흐름

- 세션 목록: `GET /v1/sessions`
- 메시지 조회: `GET /v3/sessions/:sessionId/messages`
- 메시지 추가: `POST /v3/sessions/:sessionId/messages`
- 세션 액션: `POST /v1/sessions/:sessionId/actions`
- 권한 큐/결정: `GET /v1/permissions`, `POST /v1/permissions/:id/decision`

ARIS web는 위 API를 채팅 워크스페이스 ViewModel로 정규화해 사용한다.

## 4. 이벤트 렌더링 계층

- Raw message -> Normalizer -> UI Event
- UI Event kind:
  - `text_reply`
  - `command_execution`
  - `code_read`
  - `code_write`

## 5. 배포 기준

- docker compose로 `aris-web + aris-backend + postgres` 동시 기동
- 도메인(`aris.lawdigest.cloud`)은 HTTPS로만 노출
- 환경변수는 `.env`(gitignore)로 관리

## 6. 장애 대응

- API 실패 시 UI는 안내 토스트/상태 배너 표시
- 메시지 폴링 실패는 비치명으로 처리하고 재시도
- UI 불가 작업은 SSH fallback로 우회
