# ARIS Information Architecture

## 1. IA 원칙

- 기본 진입점은 `대시보드`가 아니라 `채팅 워크스페이스`다.
- 사용자는 "대화 맥락 + 실행 가능한 액션"을 한 화면에서 처리한다.
- 모바일/태블릿/데스크톱 모두 동일한 핵심 구조를 유지한다.

## 2. 사이트맵

- `/` Chat Workspace (기본)
- `/?session=:id` 특정 세션 대화 컨텍스트
- `/permissions` Permission Queue (선택)
- `/ssh` SSH Fallback
- `/settings/security` 인증/세션/정책
- `/login` 로그인

## 3. 핵심 화면 구조

### Chat Workspace (`/`)

1. Session List Panel
- 현재 세션 목록, 상태, 에이전트 유형
- 세션 전환

2. Conversation Stream
- 이벤트 타임라인을 대화 버블 형태로 표시
- 응답 타입별 컴포넌트(Text/Command/Code Read/Code Write)

3. Composer Panel
- Mode Switch: Ask/Plan/Execute
- Intent Chips: fix/refactor/debug/test/ship
- Constraint Pills: safe/fast/tests-required/minimal-diff
- Send + Session Actions(abort/retry/kill/resume)

4. Context Strips
- Pending Permission Strip
- SSH fallback 안내/발급 상태

## 4. 사용자 플로우

### 플로우 A: 일반 에이전틱 코딩

1. 세션 선택
2. 채팅 스트림 확인
3. 의도 구성(Mode/Intent/Constraint)
4. 지시 전송
5. 응답 타입별 결과 확인

### 플로우 B: 승인 요청 처리

1. Pending Permission Strip 노출
2. allow once / allow session / deny 선택
3. 결과를 같은 대화 맥락에서 확인

### 플로우 C: 예외 복구

1. UI로 처리 불가능한 상황 감지
2. SSH fallback 진입
3. 권한 검증/감사 표시 확인
4. 조치 후 워크스페이스 복귀

## 5. 반응형 규칙

- Desktop (`>=1200px`): 세션 목록 + 대화 + 컴포저 동시 표시
- Tablet (`768~1199px`): 세션 목록/대화 영역 중심 2단 구성
- Mobile (`<=767px`): 단일 컬럼, 컴포저/퀵액션 접근성 우선

## 6. 의미 체계

- Text Reply: Sky
- Command Execution: Amber
- Code Read: Violet
- Code Write: Emerald
- Danger/Error: Red

모든 타입은 `색상 + 레이블 + 아이콘` 3중 표기를 적용한다.
