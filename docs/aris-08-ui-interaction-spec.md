# ARIS UI Interaction Spec

## 1. 디자인 방향

- 기준 레퍼런스: Notion 등 모던 생산성 애플리케이션
- 베이스: 화이트/라이트 뉴트럴 배경
- 강조: 의미 기반 컬러 컴포넌트 적극 사용
- 목표: 친숙하지만 고급스럽고, 행동 유도력이 높은 UI

## 2. 컬러 시스템 (Semantic)

- Base Background: White
- Surface: Soft Gray
- Primary Action: Blue
- Success/Write: Emerald
- Warning/Command: Amber
- Info/Text Reply: Sky
- Code Read: Violet
- Error/Danger: Red

원칙:

- 색상은 상태와 응답 타입을 표현하는 의미 단위로만 사용
- 같은 의미는 모든 디바이스에서 동일한 색상 규칙 유지
- 텍스트 대비는 WCAG AA 이상 유지

## 3. 응답 타입별 UI 컴포넌트

### Text Reply Block

- 톤: Sky
- 구성: 아이콘 + 요약 제목 + 본문 텍스트 + 참조 링크(선택)

### Command Execution Block

- 톤: Amber
- 구성: 명령어 헤더 + 실행 결과(stdout/stderr) + exit code 배지 + 재실행 버튼

### Code Read Block

- 톤: Violet
- 구성: 파일 경로 + 코드 스니펫 + 줄 범위 + "전체 보기" 액션

### Code Write Block

- 톤: Emerald
- 구성: 변경 파일 목록 + diff 프리뷰 + 적용 범위 강조 + 롤백(가능 시)

## 4. 사용자 의도 전달 UI

### Intent Chips

- 예: `수정`, `리팩터`, `디버그`, `테스트`, `배포`

### Mode Switch

- `Ask`, `Plan`, `Execute` 모드

### Constraint Pills

- 예: `읽기 전용`, `빠르게`, `안전 우선`, `테스트 필수`

### Action Buttons

- `Approve`, `Deny`, `Abort`, `Retry`, `Resume`

## 5. SSH Fallback UI

- 진입 위치: Session Workspace 상단 또는 오류 문맥 액션 바
- 진입 전: 권한/감사 안내 모달 노출
- 진입 후: 세션 ID, 접속 시간, 종료 버튼을 명확히 표시
- 종료 후: 원래 세션 워크스페이스로 복귀

## 6. 아이콘 가이드

- Text Reply: message/spark 아이콘
- Command: terminal/bolt 아이콘
- Code Read: file/search 아이콘
- Code Write: pencil/git-branch 아이콘
- Permission: shield/check 아이콘
- SSH: server/key 아이콘

## 7. 반응형 동작

- Desktop: 멀티 패널 + 세부 정보 동시 표시
- Tablet: 리스트-디테일 2단 전환
- Mobile: 단일 컬럼 + 하단 고정 퀵 액션

## 8. 품질 체크리스트

- 색상 의미가 타입/상태와 일치하는가
- 응답 타입별 컴포넌트가 시각적으로 충분히 구분되는가
- 모바일에서 핵심 액션이 3탭 이내인가
- 아이콘만으로 의미를 전달하지 않고 텍스트 라벨을 병행하는가
- SSH fallback 진입/종료가 명확하고 안전한가
