# ARIS MVP Feature Spec

## 1. MVP 범위

- 멀티 에이전트 세션 관제
- 응답 타입별 맞춤 렌더링 UI
- 사용자 의도 전달 인터랙션 컴포넌트
- permission 요청 큐 처리
- 세션 제어 액션
- 크로스디바이스 UI/UX (mobile/tablet/desktop)
- 로그인/접근통제 및 기본 보안 체계
- SSH Console fallback

## 2. 핵심 기능 정의

### F1. Runtime Dashboard

- 에이전트별 활성 세션 수
- 세션 상태 분포(running/idle/error/stopped)
- 위험 세션 우선 노출

수용 기준:

- 5개 이상 동시 세션에서도 상태 갱신 지연이 2초 이내
- 새 에러 이벤트 발생 시 1초 이내 시각적 강조

### F2. Session Workspace

- 단일 세션 타임라인
- 액션 버튼: Abort, Retry, Kill, Resume
- 최근 실패 원인 요약

수용 기준:

- 액션 실행 후 ACK/실패 결과가 명확히 표시
- 타임라인 이벤트 정렬 오류가 없어야 함

### F3. Response Type Renderer

- `Text Reply`, `Command Execution`, `Code Read`, `Code Write`를 타입별 UI 블록으로 렌더링
- 각 타입은 색상/아이콘/레이블 조합으로 일관되게 표시

수용 기준:

- 타입 혼동 없이 시각적으로 즉시 구분 가능
- 모바일/태블릿/데스크톱에서 동일한 의미 체계 유지

### F4. Intent Interaction Components

- Intent Chips, Mode Switch, Constraint Pills, Quick Actions 제공
- 사용자 의도를 구조화해 에이전트로 전달

수용 기준:

- 핵심 의도 전달이 2~3번 인터랙션 내 완료
- 액션 컴포넌트 상태(활성/비활성/진행중) 명확히 표현

### F5. Permission Center

- 승인 대기 요청 목록
- 위험도/명령/에이전트 필터
- 액션: allow once, allow session, deny

수용 기준:

- 승인 처리 후 큐에서 즉시 제거
- 동일 요청 중복 처리 방지

### F6. Cross-Device UX

- Desktop/Tablet/Mobile 레이아웃 최적화
- 모바일 하단 고정 퀵 액션(approve/deny/abort/retry)
- 터치 중심 조작과 키보드 조작 동시 지원

수용 기준:

- 모바일에서 핵심 액션 3탭 이내 수행
- 터치 타겟 최소 44x44px 보장
- 디바이스 변경 시 사용자가 동일한 정보구조를 인지 가능

### F7. Login & Security Baseline

- 로그인 전 런타임 페이지 접근 차단
- 사용자 세션 인증/만료/갱신 처리
- 민감 이벤트 감사 로그 기록
- E2E 암호화 적용 경로 정의 및 준수

수용 기준:

- 인증 없는 API/WS 접근 차단
- 토큰 만료 시 안전한 재인증 플로우 제공
- permission/세션 제어 이벤트 감사로그 100% 적재

### F8. SSH Console Fallback

- UI로 해결되지 않는 작업을 위한 직접 SSH 접근 옵션
- 세션 시작 전 권한 검증 및 감사 안내

수용 기준:

- 권한 없는 사용자는 SSH 진입 불가
- SSH 세션 시작/종료/명령 이벤트 감사로그 기록
- fallback 진입 후 워크스페이스 복귀 플로우 제공

## 3. 역할/권한 모델 (초안)

- `Operator`: 세션 모니터링 + permission 처리 + 세션 제어 + SSH fallback
- `Viewer`: 읽기 전용 대시보드/세션 조회

## 4. 상태 모델 (UI 관점)

- Session State: `running | idle | stopped | error`
- Permission State: `pending | approved | denied | timeout`
- Connectivity State: `connected | degraded | disconnected`
- Auth State: `authenticated | unauthenticated | expired`
- SSH State: `unavailable | ready | active | terminated`

## 5. API/이벤트 매핑 원칙

- 기존 happy 메시지 포맷을 우선 그대로 수용
- ARIS 내부에서 ViewModel로 정규화
- UI는 ViewModel만 참조하고 원본 이벤트 파싱은 data layer에 한정
- 인증/권한 체크는 API 계층과 WS 핸드셰이크 양쪽에서 강제
- SSH fallback은 별도 보안 채널과 감사 계층을 통과해야 함

## 6. 오픈 이슈

- 응답 타입 분류 신뢰도를 어떻게 보장할지
- 세션 제어 액션 idempotency 보장 방식
- SSH fallback 제공 방식(인앱 터미널 vs 외부 터미널 링크)
- SSO/OAuth 연동 시나리오와 로컬 계정 방식의 우선순위

## 7. Post-MVP 확장 기능 (Features-to-develop 반영)

### F9. Skills Visual Manager

- 시각화 기반의 Agent Skills 관리(등록/편집/적용 상태 확인)

### F10. Instruction Visual Manager

- 시각화 기반의 `AGENTS.md` 등 지침 문서 관리

### F11. Project Agent History Analytics

- 프로젝트별 에이전트 실행 이력 및 결과 시각화

### F12. Project Documentation Hub

- 프로젝트별 문서화(Documentation) 관리
