# ARIS UI Interaction Spec

## 1. 디자인 방향

- 기준 레퍼런스: Notion 등 모던 생산성 앱
- 베이스: White / Light Neutral
- 목표: 채팅형 작업 경험 + 프로덕션 품질

## 2. 시각 언어

- 배경은 최대한 단순하게 유지
- 정보 밀도는 카드/버블/칩 컴포넌트로 조절
- 색상은 상태/행동 의미 전달에만 사용

## 3. 대화 스트림 컴포넌트

### User Instruction Bubble
- 사용자 발화/지시를 우측 정렬 또는 구분된 버블로 표시
- mode/intents/constraints 메타를 선택적으로 노출

### Agent Reply Bubble
- Text Reply: Sky 톤
- Command Execution: Amber 톤 + exit code + 재실행 액션
- Code Read: Violet 톤 + 파일 경로/스니펫
- Code Write: Emerald 톤 + 변경 파일/요약

### System Bubble
- 승인 결과, 상태 전환, 정책 알림
- 점선 또는 중립 톤으로 사용자/에이전트와 구분

## 4. Composer 컴포넌트

- Mode Switch: Ask/Plan/Execute
- Intent Chips: fix/refactor/debug/test/ship
- Constraint Pills: safe/fast/tests-required/minimal-diff
- Primary: Send to Agent
- Secondary: abort/retry/kill/resume

## 5. Permission Strip

- 대화 흐름 안에서 pending 권한 요청 즉시 노출
- allow once / allow session / deny를 한 줄 액션으로 제공

## 6. SSH Fallback UX

- "UI로 처리 불가" 상황에서만 진입하도록 문구 명시
- 진입 전 권한/감사 경고 제공
- 진입 후 세션 식별자, 만료시간, 종료 액션 표시

## 7. 반응형 UX

- Desktop: 스트림 가독성과 동시 제어 우선
- Tablet: 세션 전환과 메시지 흐름 균형
- Mobile: 컴포저 접근성과 터치 동선 우선

## 8. 접근성 기준

- 터치 타겟 44x44px 이상
- 색상 정보는 라벨/아이콘으로 중복 전달
- 대비 WCAG AA 이상
