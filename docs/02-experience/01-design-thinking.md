# ARIS Design Thinking

## 1. Purpose

### 타겟 사용자

- 서버에서 에이전트를 상시 운영하는 개발자
- 모바일/태블릿에서 즉시 승인/중단이 필요한 사용자
- 노션류 모던 앱 경험에 익숙한 사용자

### 핵심 문제

- 채팅 맥락 없이 로그 중심 UI만으로는 작업 흐름이 끊긴다.
- 응답 타입 구분이 약하면 다음 행동 결정이 느려진다.
- 작은 화면에서 의도 입력과 운영 액션이 어렵다.

### 성공 시나리오

1. 채팅 워크스페이스 진입 후 5초 내 상태 파악
2. 타입별 응답 컴포넌트로 현재 상황 즉시 이해
3. Intent/Mode/Constraint 입력 후 지시 전송
4. Permission/세션 액션 처리
5. UI 미대응 상황은 SSH fallback으로 복구

## 2. Tone

**Modern Productive, Friendly Professional**

- 관제 콘솔 톤보다 모던 생산성 앱 톤
- 화이트 기반 + 의미 있는 다채로운 컴포넌트
- 장식보다 정보 전달력이 우선

## 3. Differentiator

**Color-Coded Agentic Conversation Blocks**

- AI 응답을 타입별 대화 블록으로 표시
- 사용자 의도 입력 자체를 컴포넌트(칩/토글/액션)로 구조화
- 문맥형 액션과 SSH fallback을 같은 워크스페이스에서 연결

## 4. Constraints

### 기술
- 웹 클라이언트 단일 코드베이스로 cross-device 대응
- 런타임 백엔드는 services 계층으로 분리하여 references 비의존 유지

### 품질
- 초기 로드 3초 이내
- 동시 세션 5~10개에서 조작 지연 최소화

### 접근성/반응형
- 터치 타겟 최소 44x44px
- 색상 + 텍스트 + 아이콘 중복 표현
- mobile/tablet/desktop 동일 의미 체계 유지

### 보안
- 로그인 전 데이터 비노출
- 민감 이벤트 감사로그 강제
- SSH fallback은 권한/감사 정책 필수
