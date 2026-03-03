# ARIS Roadmap

## Phase 0. Foundation (1주)

- ARIS 브랜딩/문서 기준 확정
- happy 연동 경계(API, Socket, daemon) 검증
- 화이트 베이스 + 의미 컬러 UI 시스템 초안 확정
- 로그인/토큰/암호화 정책 초안 확정

산출물:

- 본 docs 세트
- UI 토큰/컴포넌트 초안

## Phase 1. Core UX & Read-Only (2주)

- Runtime Dashboard 구현
- Session Workspace read-only 타임라인 구현
- 응답 타입별 렌더러(Text/Command/Code Read/Code Write) 구현
- mobile/tablet/desktop 반응형 레이아웃 1차 구현

완료 기준:

- 실시간 상태 모니터링 가능
- 응답 타입을 시각적으로 즉시 구분 가능
- 모바일에서도 핵심 상태 확인 가능

## Phase 2. Actionable Interactions (2주)

- Intent Chips/Mode/Constraint 등 의도 전달 컴포넌트 구현
- Permission Center 구현
- Abort/Retry/Kill/Resume 액션 연동
- 모바일 퀵 액션 바 완성

완료 기준:

- 사용자 의도 전달이 구조화된 UI로 가능
- 웹에서 운영 액션 수행 가능
- 모바일에서 승인/중단 액션이 실사용 가능

## Phase 3. Security & Stabilization (1~2주)

- 로그인/세션 만료/갱신 처리 구현
- 인증 가드(API/WS) 및 감사 로그 구현
- E2E 암호화 적용 경계 점검 및 검증
- 부하/회복력 테스트

완료 기준:

- 인증 없는 접근 차단
- 핵심 보안 이벤트 추적 가능
- 실제 운영 가능한 안정성 확보

## Phase 4. SSH Fallback & Hosting (1주)

- SSH fallback 접근 방식 구현
- SSH 권한/감사/종료 정책 구현
- 도메인 연결 및 HTTPS 운영 배포
- 운영 런북 정리

완료 기준:

- UI 비대응 상황에서 안전한 SSH 우회 가능
- SSH 감사 추적 가능
- 운영 배포 완료

## Phase 5. Post-MVP

- 시각화 기반의 에이전트 Skills 관리
- 시각화 기반의 `AGENTS.md` 등 지침 문서 관리
- 프로젝트별 에이전트 실행 이력 및 결과 시각화
- 프로젝트별 문서화(Documentation) 관리
- 멀티 사용자 역할 기반 권한 및 SSO/OAuth 고도화

## 리스크 및 대응

- 리스크: happy 내부 변경으로 인한 연동 깨짐
  - 대응: adapter 계층으로 의존성 격리
- 리스크: 컬러 과다 사용으로 가독성 저하
  - 대응: semantic color rules + 접근성 대비 검증 자동화
- 리스크: 모바일 사용성 저하
  - 대응: 액션 우선 레이아웃 + 터치 UX 테스트 강화
- 리스크: SSH fallback 오남용
  - 대응: RBAC + 시간 제한 세션 + 감사 로그
