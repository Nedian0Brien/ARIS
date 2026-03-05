# ARIS Dark Mode Support Plan

## 1. 목적

- 야간/저조도 환경에서 가독성과 피로도를 개선한다.
- 채팅 중심 워크스페이스의 정보 우선순위(대화, permission, 세션 액션)를 다크 테마에서도 동일하게 유지한다.
- 기존 라이트 모드 사용자 경험을 깨지 않으면서 점진적으로 적용한다.

## 2. 범위

포함:
- `services/aris-web`의 공통 토큰, 전역 스타일, 핵심 레이아웃/컴포넌트
- 로그인 화면, 세션 대시보드, 채팅 화면, permission 관련 UI
- 테마 선택(시스템/라이트/다크) 및 사용자 설정 저장

제외(후속):
- 브랜드 마케팅 이미지/아이콘의 테마별 별도 아트워크
- 고급 사용자별 커스텀 테마(색상 직접 편집)

## 3. 디자인 원칙

### Purpose
- 정보 밀도가 높은 화면에서 대비를 안정적으로 유지해 "빠른 상태 파악"을 보장한다.

### Aesthetic Direction
- Professional + Focused Dark
- 과도한 네온/글로우를 피하고, 깊은 배경 위에 의미 있는 포인트 컬러를 사용한다.

### Memorable Element
- 응답 타입(`text_reply`, `command_execution`, `code_read`, `code_write`)의 컬러 아이덴티티를 다크 모드에서도 유지하되 명도/채도를 재보정한다.

### Constraints
- 기존 CSS 변수(`tokens.css`) 기반 구조를 유지한다.
- 모바일/태블릿/데스크톱에서 동일한 의미 체계를 사용한다.
- WCAG AA 대비를 기본 목표로 한다.

## 4. 구현 전략

### 4.1 토큰 이원화
- `:root`는 라이트 토큰을 유지한다.
- `[data-theme="dark"]` 토큰 세트를 추가한다.
- 의미 기반 토큰(`--bg`, `--surface`, `--text`, `--line`, `--primary`)을 우선 사용하고, 하드코딩 컬러를 제거한다.

### 4.2 초기 테마 결정 방식
- 우선순위: 사용자 명시 선택 > 시스템 설정(`prefers-color-scheme`) > 라이트 기본값
- 초기 렌더 전에 `data-theme`를 세팅해 FOUC(섬광) 현상을 최소화한다.
- 사용자 선택은 로컬 저장소(필요 시 쿠키 병행)로 유지한다.

### 4.3 컴포넌트 마이그레이션 순서
1. 글로벌 레이어: `tokens.css`, `ui.css`, `layout.css`, `typography.css`
2. 핵심 화면: `dashboard`, `chat-layout`, `chat-desktop`, `session-modal`
3. 보조 화면: `directory-browser`, `rename-modal`, `bottom-nav`, `fab`
4. 상태 표현: success/warning/error/info 컬러 및 테두리/배경 대비 점검

### 4.4 차트/아이콘/코드블록 대응
- `recharts` 축/격자/툴팁 색상을 토큰으로 연결한다.
- SVG 아이콘은 `currentColor` 기반으로 통일한다.
- 코드/명령 출력 영역은 모노스페이스 가독성과 선택 영역 대비를 별도 점검한다.

## 5. 단계별 실행 계획

### Phase 1. Foundation (0.5~1일)
- 다크 토큰 정의
- 테마 상태 모델(시스템/라이트/다크) 정의
- 초기 렌더 시점 테마 적용 훅 구성

완료 기준:
- 루트 레벨에서 라이트/다크 전환이 가능하고 주요 배경/텍스트 색이 즉시 반영된다.

### Phase 2. Core Screen Migration (1~2일)
- 로그인, 대시보드, 세션 상세 채팅 UI 대응
- permission/세션 액션 버튼 대비 및 hover/focus 상태 정리

완료 기준:
- 핵심 사용자 플로우(로그인 -> 세션 진입 -> 지시/승인/액션)가 다크 모드에서 시인성 저하 없이 동작한다.

### Phase 3. QA & Accessibility (0.5~1일)
- WCAG 대비 점검
- 모바일/태블릿/데스크톱 회귀 테스트
- 테마 전환 중 레이아웃 흔들림/깜빡임 점검

완료 기준:
- 주요 컴포넌트 대비 기준 충족, 테마 전환 시 기능 회귀 없음.

### Phase 4. Rollout (0.5일)
- 기능 플래그 또는 점진 배포
- 운영 피드백 수집 후 미세 조정

완료 기준:
- 운영 환경에서 테마 전환 관련 오류/불만이 임계치 이하.

## 6. 영향 파일(예상)

- `services/aris-web/app/styles/tokens.css`
- `services/aris-web/app/globals.css`
- `services/aris-web/app/layout.tsx`
- `services/aris-web/app/styles/chat-layout.css`
- `services/aris-web/app/styles/chat-desktop.css`
- `services/aris-web/app/styles/dashboard.css`
- `services/aris-web/app/styles/ui.css`
- `services/aris-web/components/layout/Header.tsx` (테마 토글 UI 추가 시)

## 7. 검증 체크리스트

- 다크/라이트 전환 시 텍스트, 버튼, 입력창, 경계선 대비가 유지된다.
- 상태 색상(success/warning/error/info)이 색상+아이콘+텍스트로 중복 표현된다.
- 모바일(좁은 폭)에서 터치 타겟 44x44px 기준을 유지한다.
- 페이지 새로고침 후 사용자 테마 선택이 유지된다.
- 로그인 전/후 화면 모두 동일한 테마 정책을 따른다.

## 8. 리스크와 대응

- 리스크: 일부 컴포넌트의 하드코딩 컬러로 인한 미적용
- 대응: 토큰 사용 강제 규칙과 점검 목록 운영

- 리스크: 최초 로드 시 테마 섬광(FOUC)
- 대응: 초기 렌더 이전 `data-theme` 설정

- 리스크: 차트/코드블록의 대비 부족
- 대응: 시각 회귀 테스트 스냅샷 및 수동 접근성 점검 병행
