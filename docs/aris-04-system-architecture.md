# ARIS System Architecture (Based on happy)

## 1. 아키텍처 원칙

- `happy` 코어를 재사용하고 ARIS는 상단 UX/경험 계층에 집중
- 기존 API/WS 프로토콜을 우선 사용하고, 확장이 필요할 때만 최소 변경
- 세션 실행 주체는 서버 상의 `happy-cli`/daemon
- 로그인 기반 접근통제를 전제로 모든 런타임 기능 제공
- UI 범위를 넘어서는 예외 작업은 보안 통제된 SSH fallback으로 처리

## 2. 논리 구성

1. ARIS Web Client (mobile/tablet/desktop)
2. UI Renderer Layer (응답 타입별 컴포넌트 매핑)
3. Intent Interaction Layer (의도 전달 UI + 액션 디스패처)
4. Auth Layer (로그인, 토큰 발급/검증, 권한 정책)
5. happy-server (`/v1/*`, `/v3/*`, Socket.IO)
6. happy-cli daemon (claude/codex/gemini 세션 실행)
7. SSH Gateway/Fallback Channel (권한 기반 직접 접근)

## 3. 데이터/제어 흐름

1. 사용자가 ARIS Web에서 로그인 후 입력/액션 수행
2. Web Client가 `happy-server` API 또는 socket 이벤트 호출
3. 서버 이벤트를 UI Renderer가 응답 타입별 컴포넌트로 변환
4. 사용자가 Intent Interaction Layer를 통해 후속 의도 전달
5. UI로 불가한 작업은 SSH fallback 채널로 전환
6. 실제 에이전트 프로세스 제어는 daemon + CLI에서 수행

## 4. 재사용 경계

### 그대로 재사용

- 인증/토큰 모델 (`/v1/auth`) 기본 구조
- 세션/메시지 저장 모델 (`/v1/sessions`, `/v3/sessions/:id/messages`)
- 소켓 경로와 실시간 업데이트 모델
- E2E 암호화 및 메타데이터 구조

### ARIS에서 추가/확장

- 응답 타입별 렌더러 스키마
- 의도 전달 UI(칩/모드/제약/퀵액션)와 이벤트 매핑
- 로그인 UX 및 세션 접근 제어 정책
- SSH fallback 진입 정책/감사 로깅

## 5. 권장 배포 토폴로지

- `aris-web` 컨테이너: 정적 빌드 산출물 서빙 (nginx)
- `happy-server` 컨테이너: API/Socket 백엔드
- `happy-cli`는 호스트 또는 런타임 영역에서 daemon 상시 운영
- `ssh-gateway`(선택): 웹 기반 SSH 세션 중계
- 외부 노출: `nginx 443` -> `aris-web` + `/api` + `/ssh`
- 인증 비밀키/암호화 키는 비밀 저장소로 관리

## 6. 보안 모델 (요약)

- 필수 로그인: 인증 없는 접근 차단
- 토큰 정책: 짧은 수명의 access token + 회전 가능한 refresh token
- 전송 구간: HTTPS/TLS, WSS 강제
- 데이터 구간: 민감 데이터는 E2E 암호화 우선
- SSH fallback: 권한/세션/감사 정책 하에서만 허용
- 감사 추적: permission/세션 제어/SSH 액션 전부 로그 기록

세부 설계는 `aris-07-security-model.md`를 따른다.

## 7. 장애/복구 전략

- 서버 연결 끊김 시 Web Client는 "degraded mode"로 전환
- 세션 액션 재시도 큐를 두고 연결 복구 시 순차 재전송
- daemon 불일치/다운 시 즉시 배너 경고 및 복구 가이드 제공
- 인증 만료 시 재로그인 유도 후 미처리 액션 재시도
- UI 동작 실패 시 SSH fallback으로 우회

## 8. 구현 우선순위

1. read-only 대시보드 + 반응형 레이아웃
2. 응답 타입별 렌더링 컴포넌트
3. 의도 전달 UI 컴포넌트
4. permission/세션 제어 액션
5. 로그인/접근통제 + 감사 로그
6. SSH fallback 채널 통합
