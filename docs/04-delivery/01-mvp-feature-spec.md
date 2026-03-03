# ARIS MVP Feature Spec

## 1. MVP 범위

- Chat-first Session Workspace
- 응답 타입별 렌더링(Text/Command/Code Read/Code Write)
- 의도 전달 컴포넌트(mode/intent/constraint)
- permission 처리, 세션 제어 액션
- 크로스디바이스 UI/UX
- 로그인/권한/감사 로그
- SSH fallback

## 2. 기능 상세

### F1. Chat Workspace (핵심)
- 세션 목록 + 대화 스트림 + 컴포저
- 기본 진입 경로 `/`

수용 기준:
- 세션 전환 후 이벤트가 일관된 순서로 보인다.
- 사용자 지시 전송 후 대화 스트림에 즉시 반영된다.

### F2. Response Type Renderer
- `text_reply`, `command_execution`, `code_read`, `code_write` 전용 UI

수용 기준:
- 타입 인지 혼동 없이 시각적으로 구분된다.

### F3. Intent Composer
- Ask/Plan/Execute 모드
- Intent/Constraint 칩

수용 기준:
- 의도 전달을 2~3 인터랙션 내 수행한다.

### F4. Permission Actions
- allow once / allow session / deny

수용 기준:
- 처리 결과가 대화 맥락에 반영된다.

### F5. Session Runtime Actions
- abort / retry / kill / resume

수용 기준:
- 액션 성공/실패가 명확히 안내된다.

### F6. Cross-Device UX
- mobile/tablet/desktop 대응

수용 기준:
- 모바일 핵심 액션 3탭 이내
- 터치 타겟 최소 44x44px

### F7. Login & Security Baseline
- 로그인 전 접근 차단
- operator/viewer 권한 분리
- 감사로그 기록

수용 기준:
- 인증 없는 API 접근이 차단된다.
- 민감 액션 감사로그 100% 기록

### F8. SSH Fallback
- UI 대응 불가 작업 우회 경로

수용 기준:
- 권한 없는 접근 차단
- 진입/종료 이벤트 추적 가능

## 3. 오픈 이슈

- 실시간 push(WS) vs polling 최적화
- 타입 분류 신뢰도 향상 규칙
- SSH fallback UX 제한 정책 세분화
