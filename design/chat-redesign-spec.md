# ARIS Chat Redesign — Implementation Specification

> 구현 단계에서 놓치는 기능이 없도록 `chat-prototype.html` 기준 전체 기능을 체크리스트로 정리한 문서.
> 체크박스 `[ ]` → 미구현, `[x]` → 구현 완료.
> 관련 디자인 참조: [chat-screen-v1.html](./chat-screen-v1.html), [chat-prototype.html](./chat-prototype.html), [design-system-v1.html](./design-system-v1.html), [chat-composer-v2.html](./chat-composer-v2.html).

---

## Home — Project card (IA v2)

### Project card 내부 데이터 구조
- [ ] 각 프로젝트 카드에 **최근 채팅 2건** 노출 (고정)
- [ ] 각 채팅 행은 세 조각으로 구성:
  - [ ] **Status dot** (7px, 채팅 자체 상태: `running`/`completed`/`needs-approval`/`idle`)
  - [ ] **채팅 제목** — 1줄 ellipsis (`chat.title`)
  - [ ] **마지막 사용자 메시지** — 1줄 ellipsis (`messages WHERE chat_id=? AND role='user' ORDER BY created_at DESC LIMIT 1`)
- [ ] 채팅이 2건 미만이면 빈 행 placeholder 또는 영역 축소
- [ ] LLM 요약 · 캐시 · 백그라운드 잡 **사용 안 함** — 기존 chat/message 테이블만 조회
- [ ] 쿼리: 프로젝트별 `chats ORDER BY updated_at DESC LIMIT 2` + 각 chat의 마지막 user message

### 색상 규칙 (status dot)
- [ ] `running` — `--b-500` + `0 0 0 2px rgba(47,107,255,0.18)` glow + pulse 1.6s
- [ ] `needs-approval` — `--warning-fg` + amber glow + pulse 1.2s
- [ ] `completed` — `--success-fg` (정적)
- [ ] `idle` — `--n-300` (정적)

### Head & foot (project-level)
- [ ] 카드 상단: 프로젝트명 + 디렉토리 path + 프로젝트 전체 status badge
- [ ] 프로젝트 전체 status 계산: 채팅 중 하나라도 `running`이면 running, 아니면 `needs-approval`, 아니면 가장 최근 완료/유휴 반영
- [ ] 카드 하단: 총 채팅 수 + "last {relative time}" (가장 최근 activity)

---

## 0. Foundations

### Design tokens
- [ ] Neutral 12-step scale (`--n-0` ~ `--n-950`)
- [ ] Brand 11-step (Refined Blue `--b-50` ~ `--b-950`, hero `#2F6BFF`)
- [ ] Agent brand accents (`--agent-claude`, `--agent-codex`, `--agent-gemini`)
- [ ] Mode colors (Agent blue, Plan violet, Terminal emerald — fg/bg/dim variants)
- [ ] Semantic (success/danger/warning/info — fg/bg 페어)
- [ ] Surface layers (surface, raised, sunken, hover, active, overlay)
- [ ] Text roles (primary/secondary/tertiary/disabled/on-brand)
- [ ] Border (subtle/default/strong)
- [ ] Spacing (2px 기반 `--sp-1` ~ `--sp-16`)
- [ ] Radius (xs/sm/md/lg/xl/2xl/full)
- [ ] Shadows (xs/sm/md/lg/xl)
- [ ] Typography letter-spacing (tight/snug/normal)
- [ ] Motion (fast 120ms / base 180ms / slow 260ms, `cubic-bezier(0.16,1,0.3,1)`)

### Theme
- [ ] Light theme as default
- [ ] Dark theme via `html[data-theme='dark']`
- [ ] Dark 전용 surface 재정의 + border/brand-bg/shadow 조정
- [ ] Theme toggle UI (상단 control bar)
- [ ] Theme preference persistence (localStorage — 실제 구현 시)

### Typography
- [ ] Sans: Inter (+ Pretendard Variable for Korean)
- [ ] Mono: JetBrains Mono
- [ ] 타이틀 negative letter-spacing 적용

---

## 1. Layout Shell

### Viewport layouts
- [ ] Desktop (≥1200): 3-column `264 sidebar + flex main + 420 workspace`
- [ ] Tablet (768-1199): 2-column `56 rail + flex main`, workspace는 slide-in overlay
- [ ] Mobile (<768): single-column main, sidebar는 drawer, workspace는 bottom sheet
- [ ] `data-vp` 속성 기반 레이아웃 스위칭 (프로토타입) / 실제 구현은 media queries
- [ ] Workspace toggle 버튼 (헤더)
- [ ] Workspace open/closed state persistence (per session — 실제 구현)
- [ ] Responsive transitions (width/opacity smoothing)

### Prototype-only controls
- [ ] 상단 control bar: 로고 + Viewport 토글 (Desktop 1440 / Tablet 820 / Mobile 390) + Theme 토글
- [ ] Device frame (shadow + rounded corners; mobile 노치 시뮬레이션)

---

## 2. Sidebar (Sessions)

### Desktop (264px)
- [ ] Brand: logo + "ARIS" wordmark
- [ ] New chat CTA (brand blue, icon + label)
- [ ] Search input + `⌘K` hint kbd
- [ ] Scroll area (custom scrollbar, overflow-x hidden)
- [ ] 그룹 라벨: Pinned / Today / Yesterday / Earlier
- [ ] 그룹 카운트 (mono, tertiary)
- [ ] Session item: dot + name (ellipsis) + time (mono)
- [ ] Active item 스타일 (`sb__item--active`): b-50 bg + b-700 text + font-weight 600
- [ ] User footer: avatar + name + meta + settings icon

### Tablet rail (56px)
- [ ] Icon-only 표시 (name/time/label 숨김)
- [ ] New chat / search / item 모두 center-aligned
- [ ] Footer 유저 아바타만 표시

### Mobile drawer
- [ ] Left edge drawer, 82% width (max 320)
- [ ] Backdrop scrim (dim + blur)
- [ ] Close button in drawer header
- [ ] 햄버거 버튼 (chat header)에서 open trigger
- [ ] Scrim click → close
- [ ] Enter animation (slide-in from left)

### Session item — status dot (NEW)
- [ ] `data-status="running"` — brand blue + pulse + ring
- [ ] `data-status="completed"` — success green + subtle ring
- [ ] `data-status="needs-approval"` — warning amber + fast pulse + ring
- [ ] `data-status="idle"` — neutral border-strong (no animation)
- [ ] Active session의 background과 독립적으로 작동
- [ ] Dark theme에서도 각 색이 충분히 대비

### Session item — hover tooltip (NEW)
- [ ] 280px 팝오버 (title + meta + status pill + last user message)
- [ ] 우측 사이드바 바로 옆에 위치 (desktop/tablet 모두)
- [ ] 화면 밖으로 벗어나지 않도록 top clamp
- [ ] Last user message 3-line clamp
- [ ] Status 색상 동기화 (dot + 라벨)
- [ ] Fade-in + slight slide-in 트랜지션 (120ms)
- [ ] `focus` / `blur`에도 동일 동작 (키보드 네비게이션)
- [ ] 모바일 (터치)에서는 hover 비활성화
- [ ] `aria-hidden` + `role="tooltip"` 접근성

---

## 3. Chat Header

- [ ] 52px 고정 높이
- [ ] 모바일 햄버거 버튼 (sidebar drawer open)
- [ ] 세션 타이틀 (ellipsis, 한 줄)
- [ ] Running status pill (b-50 bg, pulse dot)
- [ ] Model meta (Claude Opus 4.7 · 토큰 · 경과시간) — mobile에서는 숨김
- [ ] Actions: Share / Workspace toggle / More
- [ ] Workspace toggle `aria-pressed` 상태 반영
- [ ] Icon action 32×32 hit target

---

## 4. Timeline

### Container
- [ ] 스크롤 컨테이너 `.tl` (main 내부, 자동 채움)
- [ ] Max-width 780px center-aligned content
- [ ] Scroll-behavior: smooth
- [ ] Mobile에서 padding 축소

### Message types
- [ ] Day divider (dashed line + 레이블 mono)
- [ ] User message — b-50 bubble (border b-100)
- [ ] User message + attachment chip (file icon + name + size)
- [ ] Agent message — bubble 없이 본문 그대로 (아바타 + name + time)
- [ ] Agent brand avatar: Claude (coral) / Codex (green) / Gemini (purple)
- [ ] Thinking state (3-dot pulse + elapsed seconds)
- [ ] Tool call chip collapsed (icon + title + cmd + meta + caret)
- [ ] Tool call icon states: success(green) / running(blue) / error(red)
- [ ] Tool call expanded state (클릭 시 확장 — 실제 구현)
- [ ] Code block (어두운 배경 고정, 언어 badge, copy 버튼)
- [ ] Code syntax highlight (tokens: kw/str/fn/cm)
- [ ] Permission request (warning bg, Reject/Always/Approve)
- [ ] System notice (centered, muted, mono)

### Inline preview artifact chip
- [ ] 에이전트 메시지 내부, 썸네일 + 파일명 + 사이즈 + Preview 버튼
- [ ] 클릭 시 preview overlay open
- [ ] hover에 버튼 배경 b-50

### Message IDs & scroll targets
- [ ] 각 사용자 메시지에 `id="msg-u-NN"` 부여
- [ ] 각 에이전트 최종 메시지에도 id (Chat History jump-to 위해)
- [ ] `msg--highlight` 클래스 (1.8s blue ring pulse animation)

---

## 5. Jump Bar

- [ ] Composer 바로 위 sticky pill
- [ ] Glassmorphism 배경 (backdrop-filter: blur)
- [ ] Dot + 라벨 + jump 버튼 + dismiss 버튼
- [ ] 새 활동 감지 시 등장, dismiss 시 세션 동안 숨김
- [ ] Pointer events 관리 (wrapper none / bar auto)

---

## 6. Composer v2

### Structure
- [ ] 카드 (border + shadow-xs + r-xl)
- [ ] Focus ring (3px, mode-colored soft halo)

### Mode toggle (Agent / Plan / Terminal)
- [ ] Segmented pill group (r-full, 2px inner padding)
- [ ] 각 모드 dot 색상: Agent blue / Plan violet / Terminal emerald
- [ ] Active pill: mode-color filled bg + 흰색 텍스트 + 흰색 dot + inner highlight shadow
- [ ] 비활성 pill: text-secondary, hover to primary
- [ ] Body data-mode 속성 반영 (composer ring + Send 버튼 색상 동기화)

### Context / model chip
- [ ] 우측 정렬, pill 형태
- [ ] Provider logo (circular 22px, agent color bg): Claude/Codex/Gemini inline SVG
- [ ] 모델명 (font-weight 600) + effort badge (mono, info bg)
- [ ] Caret (chevron down)
- [ ] 클릭 → Model selector popover (별도 프로토 참조)

### Model selector popover (chat-composer-v2.html)
- [ ] Eyebrow 라벨 ("MODEL")
- [ ] Provider avatar row (Claude/Codex/Gemini 원형 선택)
- [ ] 선택된 provider에 따라 모델 리스트 필터
- [ ] Model list items (체크 + 이름 + 사양)
- [ ] Effort chips segmented (Claude 5단계, Codex 4단계, Gemini 3단계)
- [ ] Esc/클릭 외부 → close

### Attachment chips
- [ ] 입력 영역 상단 행
- [ ] File icon + name (mono) + 제거 X 버튼
- [ ] 복수 첨부 대응 (wrap)
- [ ] 없을 때 영역 숨김

### Textarea
- [ ] Auto-resize (min 52 / max 200px)
- [ ] Placeholder (`Shift ↵ 줄바꿈 · ⌘ ↵ 전송`)
- [ ] IME (한국어) 입력 안정성
- [ ] Paste 파일 → 첨부 chip 추가 (실제 구현)

### Toolbar
- [ ] Left: + (add) / Attach / @mention / Voice
- [ ] Right (desktop/tablet): `⌘↵ send` hint kbd-group
- [ ] Send 버튼 pill (mode 색, "Send" + arrow icon)
- [ ] Running 상태에서 Stop pill (danger red, "Stop" + square icon)
- [ ] Disabled 상태 (빈 input + no attach)

### Mobile composer
- [ ] Hint 숨김
- [ ] Send 버튼 taller (34px, larger padding)
- [ ] Padding 축소

---

## 7. Workspace Pane

### Header
- [ ] 타이틀 (아이콘 + Workspace)
- [ ] Expand (fullscreen) 버튼
- [ ] Close 버튼

### Tabs
- [ ] Run / Files / Terminal / Context 4탭
- [ ] Files에 count badge (변경 파일 수)
- [ ] Active tab underline (b-600, 2px)
- [ ] Hover color 변화

### Status strip
- [ ] Model dot + name (agent color)
- [ ] Running pill (pulse)
- [ ] Duration meta
- [ ] Stop 버튼 (danger, 22×22)

### Run pane — Step timeline
- [ ] Summary 3-cell grid (Steps / Tokens / Duration)
- [ ] Step rows: dot + title + cmd(mono) + time
- [ ] Dot states: done(green✓) / running(blue pulse) / pending(empty)
- [ ] 연결선 (steps 사이, absolute positioned)
- [ ] Active step highlight (b-50 bg, 확장된 padding)
- [ ] Progress bar (진행중 step만)
- [ ] Pending step의 title은 text-tertiary

### Run pane — Chat History (NEW)
- [ ] Section header: "Chat history" + turns count
- [ ] Turn 리스트 (`.chturn[data-open]` collapsible)
- [ ] 접힌 상태: 아바타 + 이름 + 시간 + 상태 pill(`answered`/`running`) + 2-line 사용자 메시지 clamp
- [ ] Caret (우측, 열림 시 90° rotate)
- [ ] 열린 상태: dashed divider + 에이전트 응답 영역
- [ ] 에이전트 영역: Claude 아바타 + label + Final/In-progress 배지 + 시간
- [ ] 에이전트 텍스트 (최대 120px scroll, rich markup inline code 지원)
- [ ] 액션 pill 그룹: Jump to message / Open preview / Copy summary / Wait for final (조건부)
- [ ] Jump 동작: 타임라인에서 해당 메시지로 smooth scroll + highlight
- [ ] Mobile: Jump 전에 bottom sheet 자동 close
- [ ] Focus outline 유지 (키보드)

### Files pane
- [ ] Tree view (dir/file 구분)
- [ ] Dir 아이콘 (folder, b-600)
- [ ] File 아이콘 (document)
- [ ] Indent (padding-left per depth)
- [ ] Diff badges `+N` green, `-N` red (mono)
- [ ] Row hover
- [ ] 실제 구현: 파일 클릭 → diff viewer 또는 편집 열기

### Terminal pane
- [ ] Shell chrome (traffic light dots + `bash · aris-web` tag + pid)
- [ ] Body (max-height scroll, mono)
- [ ] Line styles: prompt(`~/aris-web$` blue) / output / ok(✓ green) / error(✗ red) / dim
- [ ] Last line with cursor
- [ ] 실행 중 스피너 (실제 구현)
- [ ] Clear / Expand 버튼 (실제 구현)

### Terminal pane — Snippets (NEW)
- [ ] Search input + Save current 버튼 행
- [ ] 그룹 분류: Dev / Deploy / Git / ARIS (확장 가능)
- [ ] Snippet row: name(84-96px) + command(mono ellipsis) + 태그 chip + hover actions
- [ ] Tag 색상 variants: default(info) / warn(prod 배포) / danger(rollback)
- [ ] Hover 시 Insert / Edit 액션 버튼 슬라이드 인
- [ ] 클릭 → terminal prompt line에 명령어 삽입 + 0.22s 배경 피드백
- [ ] Search input → 실시간 filter (빈 그룹 숨김)
- [ ] 실제 구현: Save current → 현재 터미널 마지막 명령 저장 / Edit → 인라인 편집 / 삭제 / 재정렬

### Context pane
- [ ] Circular usage ring (SVG dasharray; % 중앙 표시)
- [ ] Prompt / Completion / Headroom split 수치
- [ ] Attached files 그룹 (file 아이콘 + name + token count)
- [ ] System & tools 그룹 (system_prompt / tool_definitions / terminal_output)
- [ ] Token 합계와 footer bar 동기화

### Workspace footer
- [ ] "Context usage" 라벨 + `used/limit` 수치
- [ ] Gradient progress bar
- [ ] 메타 `% of limit` + `headroom`

---

## 8. Preview System

### Inline artifact chip (Entry A)
- [ ] Agent 메시지 내부 artifact 렌더
- [ ] 썸네일 (gradient + sheet 효과)
- [ ] 파일명 (mono) + 사이즈 + 생성 시간
- [ ] "Preview" 버튼 (brand color text)
- [ ] 클릭 → overlay open

### Dock chip (Entry C)
- [ ] Composer 위 floating pill (absolute positioning)
- [ ] 썸네일 + 파일명 + zoom% + live dot + expand 버튼 + close 버튼
- [ ] `data-preview="dock"` 일 때 표시
- [ ] Desktop 우측 workspace width 보정
- [ ] Mobile에서 composer 더 가깝게

### Floating overlay
- [ ] Dim scrim + backdrop blur
- [ ] Proto-frame 내부에 confined (실제 구현은 viewport 전체)
- [ ] Preview topbar:
  - [ ] Back / Forward / Refresh 버튼
  - [ ] URL bar (protocol green + target + status mono)
  - [ ] Device toggle (1200 / 768 / 390)
  - [ ] External link / Dock / Close 버튼
- [ ] Canvas (checkerboard bg + simulated page)
- [ ] Floating controls (glass pill: zoom-out / % / zoom-in / screenshot / devtools)
- [ ] 실제 구현: iframe 기반 렌더 + HMR 연동

### Keyboard
- [ ] `⌘⇧P` → 토글 (open ↔ dock)
- [ ] `Esc` → dock으로 축소 (완전 close 아님)

### 상태 기계 (data-preview)
- [ ] `closed` — 없음
- [ ] `open` — overlay + dock hidden
- [ ] `dock` — dock chip 표시, overlay hidden

---

## 9. Mobile Drawer (Sessions)

- [ ] Left drawer 82% width
- [ ] 내부는 sidebar와 동일 구조 (sb__new, sb__search, scroll, footer)
- [ ] 햄버거 버튼 → open
- [ ] Scrim tap / close 버튼 → close
- [ ] Drawer 내 session item도 status dot + tooltip 지원 (실제 구현에서는 terminal 없으니 long-press 혹은 info icon으로 대체)

## 10. Mobile Bottom Sheet (Workspace)

- [ ] 78% height sheet, 상단 rounded
- [ ] Drag handle 바 (36×4 pill)
- [ ] 내부 workspace 재사용 (head / tabs / status / body)
- [ ] Scrim tap / close 버튼 → close
- [ ] Drag to resize/dismiss (실제 구현)

---

## 11. Interactions

### Mode & theme
- [ ] Viewport 버튼 → `data-vp` 업데이트 + workspace default 재설정
- [ ] Theme 버튼 → `data-theme` 토글 + 라벨 변경
- [ ] Composer mode pill → `data-mode` + composer 색상 반영

### Navigation
- [ ] 햄버거 버튼 → `data-drawer="open"`
- [ ] Drawer close → `data-drawer="closed"`
- [ ] Workspace toggle (header) → desktop/tablet open/close, mobile은 sheet
- [ ] Sheet close → `data-sheet="closed"`

### Workspace tabs
- [ ] 메인 workspace + sheet workspace 모두 동작
- [ ] aria-pressed + pane active class 동기화

### Chat History
- [ ] Turn click → `data-open` 토글
- [ ] Jump 버튼 → 스크롤 + highlight; click propagation stop

### Snippets
- [ ] Row click → 명령어 insert + 시각 피드백
- [ ] Search input → live filter + 빈 그룹 숨김

### Preview
- [ ] Artifact chip / Dock expand → overlay open
- [ ] Overlay Dock → 축소 (dock 상태)
- [ ] Overlay Close / keyboard Esc → close/dock
- [ ] `⌘⇧P` 토글

### Sidebar tooltip
- [ ] Mouseenter / focus → show + position
- [ ] Mouseleave / blur → hide
- [ ] Mobile 터치 → 비활성화

---

## 12. Accessibility

- [ ] 모든 icon-only 버튼에 `aria-label`
- [ ] `aria-pressed` 상태 (토글 버튼)
- [ ] `aria-hidden` (tooltip, overlays 닫힘 상태)
- [ ] `role="dialog"` + `aria-modal="true"` (preview overlay)
- [ ] `role="tablist"` / `role="tab"` 구조 (workspace tabs, mode toggle)
- [ ] `role="tooltip"` (sb-tip)
- [ ] 포커스 trap (drawer / sheet / overlay 열린 동안)
- [ ] Keyboard 네비게이션: Tab 순서 + Enter/Space 활성화
- [ ] 스크린 리더용 `sr-only` 라벨 (의미 있는 컨텍스트)
- [ ] Reduced motion (`prefers-reduced-motion`) 대응 — pulse 애니메이션 축소
- [ ] 충분한 대비 (WCAG AA): dark theme 포함

---

## 13. Performance

- [ ] Timeline virtualization (수백 메시지 대응) — 실제 구현
- [ ] Code block syntax highlight lazy (visible area만)
- [ ] Preview overlay의 iframe lazy mount
- [ ] Sidebar scroll position persistence
- [ ] Theme 전환 시 flicker 방지 (SSR 시 초기 script로 `data-theme` 주입)
- [ ] 폰트 preload (Inter / JetBrains Mono)
- [ ] Pulse 애니메이션 GPU 가속 (transform only)

---

## 14. Acceptance / QA

- [ ] Chrome, Safari, Firefox 모두에서 인터랙션 정상
- [ ] Dark theme 모든 컴포넌트 대비 충분
- [ ] Desktop / Tablet / Mobile 뷰포트에서 수평 스크롤 없음
- [ ] 한국어 입력 hitch 없음 (composer IME)
- [ ] 키보드만으로 전 기능 접근 가능
- [ ] Screen reader로 메시지 흐름 이해 가능
- [ ] 느린 네트워크에서도 Skeleton / progressive 렌더
- [ ] 긴 파일 첨부 시 chip overflow 대응
- [ ] 긴 세션 이름 ellipsis 정상
- [ ] Chat history turn 많을 때 scroll 성능

---

## 15. Open questions / 추후 결정사항

- [ ] 세션 item 우클릭 컨텍스트 메뉴 (pin/rename/archive)
- [ ] Preview overlay에서 다중 아티팩트 탭 지원?
- [ ] Snippet을 team-shared vs personal 구분?
- [ ] Chat history에서 pinned turn 기능?
- [ ] Mobile drawer session item status tooltip 대체 UI?
- [ ] Composer 모드별 placeholder 텍스트 차별화?
- [ ] Workspace pane drag-to-resize (px 단위)

---

_Last updated: 2026-04-24_
