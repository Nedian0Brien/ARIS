# ARIS Information Architecture

## 1. 전체 구조

ARIS는 5개 상위 영역으로 구성한다.

1. `Runtime Dashboard`
2. `Session Workspace`
3. `Permission Center`
4. `System Settings`
5. `SSH Console Fallback`

## 2. 사이트맵

- `/` Runtime Dashboard
- `/sessions/:id` Session Workspace
- `/permissions` Permission Center
- `/settings/server` 서버/도메인/연결 설정
- `/settings/agents` 에이전트별 설정(claude/codex/gemini)
- `/settings/security` 보안/권한 정책 설정
- `/login` 로그인
- `/ssh` SSH Console Fallback (권한 사용자만)

## 3. 화면별 목적

### Runtime Dashboard

- 활성 세션 현황, 위험 세션, 대기 승인 건수를 한 화면에 집약
- 카드/리스트 기반 모던 레이아웃으로 빠른 스캔 가능

### Session Workspace

- 특정 세션의 응답/이벤트를 타입별 블록 컴포넌트로 표시
- 사용자 의도 전달 컴포넌트(액션 칩, 모드 토글, 프리셋 입력) 제공
- 세션 제어 액션(Abort, Retry, Kill, Resume) 제공

### Permission Center

- 승인 요청 큐를 목록/상세로 표시
- 정책 기반 빠른 처리(한 번만 허용, 세션 허용, 항상 허용)

### System Settings

- `happy-server` endpoint, runtime 연결 상태, 정책 기본값 관리
- 인증 정책, 세션 만료, 장치 신뢰 상태 관리

### SSH Console Fallback

- UI로 처리하지 못하는 예외 시나리오 대응
- 웹 내 임베디드 터미널 또는 별도 보안 세션으로 SSH 접근

## 4. 핵심 사용자 플로우

### 플로우 A: 응답 기반 운영 판단

1. 세션 워크스페이스 진입
2. 색상/아이콘으로 응답 타입 즉시 인지
3. 필요한 액션(승인/수정/재시도) 실행
4. 후속 상태 확인

### 플로우 B: 승인 요청 처리

1. Permission Center 진입
2. 위험도/명령/에이전트 기준 필터링
3. 허용/거절 결정
4. 세션 재개 확인

### 플로우 C: 모바일 긴급 대응

1. 모바일 알림 진입
2. 관련 요청/오류 블록 확인
3. 하단 퀵 액션으로 즉시 처리
4. 결과 확인

### 플로우 D: SSH 예외 대응

1. UI 대응 한계를 감지
2. "SSH fallback" 액션 선택
3. 권한 검증/감사 배너 확인
4. SSH 콘솔에서 직접 조치
5. 조치 후 세션 워크스페이스로 복귀

## 5. 내비게이션 원칙

- 글로벌 사이드바: 상위 영역 고정 (desktop/tablet)
- 모바일: 하단 탭 + 상단 컨텍스트 헤더
- 페이지 상단: 현재 컨텍스트(에이전트, 세션, 상태) 표시
- 우측 패널: 문맥형 액션/알림 스트림 고정 (desktop)

## 6. 응답 타입 UI 체계

- `Text Reply`: 라이트 블루 톤 카드 + 문단 중심 타이포
- `Command Execution`: 앰버/오렌지 톤 터미널형 블록 + exit code 표시
- `Code Read`: 바이올렛 톤 코드 프리뷰 블록 + 파일 경로 배지
- `Code Write`: 그린/에메랄드 톤 diff 블록 + 적용 범위 강조

각 타입은 색상 + 아이콘 + 레이블 3중 표현으로 식별한다.

## 7. 사용자 의도 전달 컴포넌트

- Intent Chips: "수정", "리팩터", "디버그", "배포" 등 빠른 의도 선택
- Mode Switch: ask/plan/execute 모드 전환
- Constraint Pills: "읽기 전용", "테스트 포함", "속도 우선" 등 제약 전달
- Quick Actions: approve/deny/abort/retry

## 8. 크로스디바이스 IA 규칙

- Desktop (`>=1200px`): 멀티컬럼 + 상세 패널 동시 노출
- Tablet (`768px-1199px`): 2단 레이아웃(목록/상세 전환)
- Mobile (`<=767px`): 단일 컬럼 스택 + 하단 고정 퀵 액션
- 모든 디바이스에서 핵심 액션 세트와 색상 의미는 동일하게 유지

## 9. Post-MVP 확장 IA (Features-to-develop 반영)

- `/skills`: 시각화 기반 Agent Skills 관리
- `/instructions`: `AGENTS.md` 등 지침 문서 관리
- `/projects/:id/history`: 프로젝트별 에이전트 실행 이력/결과 시각화
- `/projects/:id/docs`: 프로젝트별 문서화(Documentation) 관리
