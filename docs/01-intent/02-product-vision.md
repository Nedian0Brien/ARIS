# ARIS Product Vision

## 1. 제품 정의

ARIS는 에이전트 런타임을 웹에서 다루기 위한 인터페이스이며, 기본 UX는 **Chat-first Agentic Coding Workspace**다.

핵심은 다음 두 가지다.
- 친숙한 채팅형 작업 흐름에서 실제 코드 작업 지시/검토/실행 제어를 수행할 것
- 모든 디바이스에서 동일한 운영 행동(승인, 중단, 재시도, 복구)을 제공할 것

## 2. 해결하려는 문제

- 런타임 이벤트가 로그 형태로만 보여서 의사결정이 느리다.
- AI 응답이 타입별로 구분되지 않아 행동 전환이 어렵다.
- 모바일에서 운영 액션 수행이 번거롭다.
- 보안 통제가 약하면 누구나 서버 런타임에 접근할 위험이 있다.

## 3. 제품 목표

- 채팅 워크스페이스 중심의 작업 UX
- 응답 타입별 맞춤 컴포넌트 렌더링
- Intent/Mode/Constraint 기반 의도 전달
- Permission/Session 제어 액션 즉시 수행
- 로그인 기반 접근통제 + 감사로그 + 암호화 경계 적용
- UI 한계 상황을 위한 SSH fallback 제공

## 4. Non-Goals

- 새로운 에이전트 실행 엔진 자체를 만드는 것
- 전체 IDE 기능을 ARIS 내에 복제하는 것
- 프로토콜 전면 교체

## 5. 성공 지표(MVP)

- 모바일 핵심 액션 3탭 이내
- permission 요청 확인 평균 10초 이내
- 응답 타입 인지율 90%+
- 인증 없는 접근 0건
- 민감 액션 감사로그 100% 기록

## 6. 제품 원칙

- Familiar Modern UX
- White-first + Semantic Color
- Cross-device Consistency
- Zero-Trust Access
- Secure by Default
