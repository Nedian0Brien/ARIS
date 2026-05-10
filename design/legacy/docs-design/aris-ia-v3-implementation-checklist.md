# ARIS IA v3 — 구현 체크리스트

> **Source:** [`docs/design/aris-ia-v3.html`](./aris-ia-v3.html)
> **Base:** [`docs/design/aris-ia-v2.html`](./aris-ia-v2.html) (v2 정보 구조 · 컴포넌트 · 디자인 토큰 그대로 유지)
> **Target:** `services/aris-web/` (Next.js 15)

---

## 개요

v2의 IA(Home · Ask ARIS · Project · Files)와 디자인 토큰은 변경하지 않는다.
v3는 그 위에 **ARIS만의 시그너처 폴리시 레이어**를 얹는다 — 토큰을 깨지 않고 기존 컴포넌트 마크업을 최소한만 손보면서, 표면의 인터랙션·ambient 요소·hover 모션으로 정체성을 만든다.

### 변경 요약

| # | 항목 | 무엇 |
|---|---|---|
| 1 | **New chat 버튼** | Solid (v2) → Ghost subtle (D안) |
| 2 | **ARIS acronym** | Hero 위 4-line mono stack 추가 |
| 3 | **Command console** | Hero 영역에 터미널 ambient 추가 |
| 4 | **Hover 인터랙션** | 사이드바·카드·칩에 미세 모션 |
| 5 | **Cursor spotlight** | m-body 마우스 위치 따라 b-500 글로우 |

### 변경하지 않는 것

- 디자인 토큰 (색상 · 타이포 · 간격 · 라운딩) — v2 동일
- 4 진입점 IA · 사이드바 그룹 구조 · 프로젝트 카드 구조
- 기존 Pretendard / Inter / JetBrains Mono 폰트 스택

---

## 사전 작업

- [ ] v3 시안 파일 확인: 라이트/다크 모드 둘 다 브라우저에서 직접 본다.
- [ ] 영향 범위 식별: 사이드바 컴포넌트 / Home 화면 컴포넌트 / 공유 CSS.
- [ ] `prefers-reduced-motion: reduce` 대응 정책 확인 (모든 추가 모션은 비활성화).

---

## 1. New chat 버튼 — Ghost subtle (D안)

### 적용 대상
- 사이드바의 New chat 버튼 (모든 표시 위치).

### 변경 (CSS)

| 속성 | v2 | **v3** |
|---|---|---|
| `background` | `var(--b-600)` | `var(--surface)` |
| `border` | none | `1px solid var(--border-default)` |
| `color` | `var(--text-inverse)` | `var(--text-primary)` |
| `box-shadow` | `inset 0 1px 0 rgba(255,255,255,0.15)` | (제거) |
| `+` 아이콘 컬러 | inherit (white) | `var(--b-500)` |
| **hover bg** | `var(--b-700)` | `var(--surface-hover)` |
| **hover border** | — | `var(--b-300)` |
| **hover text** | — | `var(--b-700)` |
| **hover icon** | — | (inherit, 상속) |

### 다크 모드
- hover text: `var(--info-fg)`
- hover border: `var(--info-fg)`
- 평소 icon: `var(--info-fg)`

### 마크업
- 변경 없음. svg + `New chat` 텍스트 그대로.

### 체크
- [ ] light 모드에서 사이드바(surface-sunken) 위에 흰색 카드처럼 보인다.
- [ ] dark 모드에서 hover 시 텍스트·보더가 info-fg(파란색)로 전환된다.
- [ ] 클릭 동작은 기존 새 채팅 핸들러 유지.
- [ ] 기존 키보드 단축키(Cmd/Ctrl + N 등) 영향 없음.

---

## 2. ARIS acronym — Hero 위 mono stack

### 위치
- Home 화면 m-body의 첫 번째 normal-flow 자식.
- "안녕하세요, 박민재님." 헤드라인(home-greet) **바로 위**, 24px(`--sp-12`) 여백.

### 마크업

```html
<div class="home-acronym" aria-label="Agentic Runtime Integration System">
  <div class="home-acronym__line"><span class="home-acronym__lead">A</span><span class="home-acronym__rest">gentic</span></div>
  <div class="home-acronym__line"><span class="home-acronym__lead">R</span><span class="home-acronym__rest">untime</span></div>
  <div class="home-acronym__line"><span class="home-acronym__lead">I</span><span class="home-acronym__rest">ntegration</span></div>
  <div class="home-acronym__line"><span class="home-acronym__lead">S</span><span class="home-acronym__rest">ystem</span></div>
</div>
```

### CSS spec

```css
.home-acronym {
  display: flex; flex-direction: column;
  gap: 0;
  margin: 0 0 var(--sp-12);
  font-family: var(--font-mono);
  line-height: 1.15;
}
.home-acronym__line { display: flex; align-items: baseline; padding: 1px 0; }
.home-acronym__lead {
  font-size: 22px; font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  width: 22px; flex-shrink: 0;
}
.home-acronym__rest {
  font-size: 12px; font-weight: 500;
  color: var(--text-tertiary);
  letter-spacing: var(--ls-snug);
  text-transform: lowercase;
  padding-bottom: 2px;
}
```

### 체크
- [ ] A·R·I·S가 좌측 22px 컬럼에 정렬되어 acronym이 시각적으로 stack된다.
- [ ] `aria-label`로 스크린 리더에 풀 네임 전달.
- [ ] 다크 모드에서도 가독성 확인 (lead는 text-primary, rest는 tertiary 그대로).
- [ ] 모바일 좁은 화면에서 줄바꿈 없이 한 줄에 들어가는지 확인 (max-width 영향).

---

## 3. Command console — 배경 터미널 ambient

### 위치
- Home 화면 m-body의 **첫 자식** (acronym 위, normal flow 영향 없음).
- `position: absolute` · `z-index: 0` · `opacity: 0.55` · 가운데 정렬 (`translateX(-50%)`).
- 콘텐츠와 같은 y 영역에 layered (배경처럼 깔림).

### 마크업

```html
<div class="cmd-console" aria-hidden="true">
  <div class="cmd-console__viewport"></div>
</div>
```

### CSS spec

```css
.cmd-console {
  position: absolute;
  top: var(--sp-2);            /* 4px */
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - var(--sp-16));
  max-width: 580px;
  height: 168px;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  z-index: 0;
  opacity: 0.55;
  mask-image: linear-gradient(180deg,
    transparent 0%,
    rgba(0,0,0,0.18) 14%,
    rgba(0,0,0,0.6) 42%,
    #000 72%,
    rgba(0,0,0,0.92) 92%,
    transparent 100%);
  -webkit-mask-image: linear-gradient(180deg,
    transparent 0%,
    rgba(0,0,0,0.18) 14%,
    rgba(0,0,0,0.6) 42%,
    #000 72%,
    rgba(0,0,0,0.92) 92%,
    transparent 100%);
}
html[data-theme='dark'] .cmd-console { opacity: 0.65; }
@media (prefers-reduced-motion: reduce) { .cmd-console { display: none; } }
```

(`.cmd-console__viewport`, `.cmd-console__line*` 세부 규칙은 v3.html 참조 — 동일하게 가져온다.)

### 동작 (JS)

매 시퀀스마다:

1. **Prompt 라인 추가** — 모든 이전 caret 제거 (마지막 줄에만 caret 유지 보장).
2. **Push-up 트랜지션** — viewport에 `translateY(line-height)` → `0`으로 480ms cubic-bezier 트랜지션. 기존 줄들이 부드럽게 위로 한 줄 밀려 올라감 (진짜 터미널 스크롤).
3. **Trim** — 라인 수가 16개를 넘으면 가장 위 줄부터 DOM 제거.
4. **Thinking pause** — 220~500ms 짧은 정지 (사용자가 입력 시작 직전 같은 느낌).
5. **Typing** — 한 글자씩 30~58ms 간격, prompt 라인 텍스트에 추가.
6. **Enter** — 180ms 후 caret 제거.
7. **Output** — 결과 라인을 즉시(타이핑 없이) 추가, 140~300ms 간격으로 0~2줄.
8. **Idle gap** — 900~1600ms 후 다음 시퀀스 시작.

### 명령어 풀 (참고용)

`SCRIPT` 배열은 v3.html 참조. 형식: `[command, [{ kind, text }, ...]]`.
- `kind`: `'out'` (default), `'ok'` (success-fg), `'info'` (text-tertiary).

### 체크
- [ ] 마지막 줄에만 caret이 깜빡인다.
- [ ] 라인이 누적되지 않고 16개를 유지하며 가장 오래된 줄부터 마스크 페이드로 사라진다.
- [ ] `prefers-reduced-motion: reduce` 환경에서 cmd-console 자체가 `display: none`.
- [ ] `aria-hidden="true"` — 스크린 리더가 무시.
- [ ] 콘텐츠(home-greet, home-strip 등)와 z-index가 충돌하지 않는다.

#### ⚠️ Layering 주의 — m-body의 :has 규칙 충돌

v2의 `.m-body:has(.home-orb) > *:not(.home-orb) { position: relative; z-index: 1; }`이 cmd-console에도 적용되어 absolute를 무력화한다. v3는 셀렉터를 다음으로 교체:

```css
.m-body:has(.home-orb) > *:not(.home-orb):not(.cmd-console):not(.home-acronym):not(.cmd-stream) {
  position: relative; z-index: 1;
}
```

> 적용 후 반드시 DevTools에서 cmd-console의 computed `position`이 `absolute`인지, home-acronym의 z-index가 의도대로 작동하는지 확인할 것. v3 작업 중 동일 셀렉터로 인해 `position: relative`가 강제되어 layering이 무너진 사례 있음.

---

## 4. Hover 인터랙션

### 4-1. 사이드바 nav 항목 (`.m-sb__nav-item`)
- transition: `background-color`, `color`, `transform` 140ms `cubic-bezier(0.22, 0.61, 0.36, 1)`.
- hover: `transform: translateX(2px)` + bg `surface-hover` + 텍스트 `text-primary`.
- hover 시 svg 아이콘 컬러 → `var(--b-500)` (다크: `var(--text-accent)`).

### 4-2. 사이드바 프로젝트 pill (`.m-sb__proj`)
- `cursor: pointer`.
- hover: `transform: translateX(2px)` + bg `surface-hover` + 텍스트 `text-primary`.

### 4-3. 홈 프로젝트 카드 (`.home-proj`)
- transition: `transform`, `box-shadow`, `border-color` 220ms.
- hover: `transform: translateY(-2px)` + box-shadow `0 18px 36px -18px rgba(15,23,42,0.22)` + border `border-strong`.
- 다크: shadow `rgba(0,0,0,0.6)`.

### 4-4. 프로젝트 리스트 카드 (`.proj-list-card`, `--new` 제외)
- 동일한 hover lift + border `b-300`.

### 4-5. Ask 최근 질문 (`.ask-recent-item`)
- `cursor: pointer`.
- hover: `transform: translateX(2px)` + bg `surface-hover`.

### 4-6. Ask 추천 칩 (`.ask-sug`)
- hover: `transform: translateY(-1px)` + border `b-300`.

### 4-7. Theme toggle (`.theme-toggle`)
- hover: `transform: translateY(-1px)` + box-shadow `--shadow-sm`.

### 체크
- [ ] 모든 hover transition은 140~220ms, `--ease-smooth` 통일.
- [ ] `prefers-reduced-motion: reduce`에서 모든 transform 비활성화:

  ```css
  @media (prefers-reduced-motion: reduce) {
    .m-sb__new:hover svg { transform: none; }
    .home-proj:hover, .proj-list-card:hover,
    .m-sb__new:hover, .theme-toggle:hover { transform: none; }
  }
  ```
- [ ] 키보드 포커스 시에도 동일한 visual feedback (focus-visible 적용 검토).

---

## 5. m-body cursor spotlight

### CSS

```css
.m-body {
  --mx: 50%; --my: 50%;
  position: relative;
  perspective: 1400px;
  perspective-origin: 50% 35%;
}
.m-body::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(280px 280px at var(--mx) var(--my),
    rgba(47,107,255,0.08), transparent 70%);
  opacity: 0;
  transition: opacity 240ms var(--ease-smooth);
  z-index: 4;
}
.m-body:hover::after { opacity: 1; }
```

### JS

```js
document.querySelectorAll('.m-body').forEach(el => {
  el.addEventListener('mousemove', (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
});
```

(React/Next.js 환경에서는 effect로 등록 + cleanup으로 제거. `prefers-reduced-motion`에서 등록 자체를 skip.)

### 체크
- [ ] 마우스가 m-body 안에 있을 때만 280px radial glow가 마우스를 따라간다.
- [ ] 다른 인터랙션(카드 hover 등)과 시각 충돌 없음 (z-index: 4로 콘텐츠 위에 떠 있지만 매우 옅음).
- [ ] `prefers-reduced-motion: reduce`에서 mousemove 리스너 등록 skip.

---

## 6. Layering & 셀렉터 정리

v3.html 끝 부분의 polish 섹션을 그대로 가져온다. 핵심 규칙:

```css
/* cmd-stream / cmd-console / home-orb / home-acronym = ambient bg layers */
.m-body > .cmd-stream { z-index: 0; }
.m-body > .home-orb { z-index: 0; }
.m-body > .cmd-console { z-index: 0; }
.m-body > *:not(.cmd-stream):not(.home-orb):not(.cmd-console):not(.home-acronym) {
  position: relative; z-index: 2;
}

/* v2 :has 규칙 교체 (위 layering 규칙 충돌 방지) */
.m-body:has(.home-orb) > *:not(.home-orb):not(.cmd-console):not(.home-acronym):not(.cmd-stream) {
  position: relative; z-index: 1;
}
```

### 체크
- [ ] `:not()` 체인이 모든 ambient bg layer를 빠짐없이 제외.
- [ ] computed style 검증: cmd-console `position: absolute`, home-acronym `position: static`(또는 relative) — 강제 override 없음.
- [ ] 새 ambient 컴포넌트 추가 시 두 셀렉터에 모두 추가할 것.

---

## 7. 접근성

- [ ] cmd-console: `aria-hidden="true"` (장식 요소).
- [ ] home-acronym: `aria-label="Agentic Runtime Integration System"` (스크린 리더가 풀 네임 읽음).
- [ ] hover 인터랙션: 키보드 포커스 시에도 동일한 시각 피드백 — `:focus-visible` 추가 검토.
- [ ] 모든 추가 모션은 `prefers-reduced-motion: reduce`에서 비활성화.
- [ ] `pointer-events: none`이 적용된 요소는 클릭이 의도적으로 비활성된 것만 — 클릭 가능해야 하는 곳 확인.

---

## 8. 성능

- [ ] cmd-console 라인 수 상한(MAX_LINES = 16) 유지 — 그 이상은 DOM에서 제거.
- [ ] cmd-console JS는 setInterval 누적 방지 — 라인이 제거될 때 setInterval도 clear.
- [ ] cursor spotlight: requestAnimationFrame으로 throttle하지 않아도 CSS variable 업데이트는 cheap, 그러나 React 환경에서는 ref + state 분리로 리렌더 방지.
- [ ] 다크 모드 토글 시 transition으로 인한 lag 없는지 (모든 컴포넌트 transition 짧게).

---

## 9. 다크 모드

모든 추가 컴포넌트는 다크 모드 컬러를 별도 정의했다 (v3.html 참조).

- [ ] 라이트/다크 모두 브라우저에서 시각 검증.
- [ ] cmd-console opacity: 0.55 (light) → 0.65 (dark).
- [ ] hover 컬러: `b-500/700` → `info-fg` 매핑 일관성.
- [ ] 코드 컬러 스킴(prompt 컬러, output kind별 컬러)이 다크 배경에서도 가독.

---

## 10. QA 시나리오

각 시나리오에서 **라이트/다크 모드 둘 다** 검증.

### 10-1. 첫 진입
- [ ] Home 화면 진입 시 cmd-console에 첫 명령어가 0.5~1초 안에 등장.
- [ ] acronym, home-greet, home-strip 위치 어긋남 없음.
- [ ] 새 채팅 버튼이 사이드바 위쪽에 ghost 형태로 떠 있음.

### 10-2. 인터랙션
- [ ] 새 채팅 버튼 hover → 보더 b-300, 텍스트 b-700.
- [ ] 사이드바 nav 항목 hover → translateX 2px + 아이콘 컬러 변경.
- [ ] 프로젝트 카드 hover → translateY -2px + shadow.
- [ ] m-body 안에서 마우스 이동 → spotlight 따라옴.

### 10-3. 모션 끄기
- [ ] OS 설정에서 `Reduce motion` 활성화 → cmd-console 사라지고, 모든 hover transform이 비활성화됨.

### 10-4. 모바일 뷰포트
- [ ] 768px 이하에서 사이드바가 숨겨지고(`@media (max-width: 800px)`), cmd-console이 좌측 0px부터 시작.
- [ ] acronym과 home-greet이 줄바꿈 없이 표시.

### 10-5. 키보드 네비게이션
- [ ] Tab으로 사이드바 항목·새 채팅 버튼·카드에 포커스.
- [ ] focus-visible 시각 피드백 충분.

### 10-6. 스크롤
- [ ] m-body 스크롤 시 콘텐츠가 cmd-console 위로 흘러가도, cmd-console은 `absolute`이므로 같이 스크롤됨 (의도된 동작).
- [ ] 스크롤 후 cmd-console 영역이 시야에서 벗어나도 명령어 시퀀스는 계속 진행 (메모리 누적 없는지 확인).

---

## 11. 단계별 작업 순서 (권장)

1. [ ] **CSS 토큰 확인** — v2와 동일, 변경 없는지 확인.
2. [ ] **New chat 버튼 D안** — 가장 visible하고 risk 낮음. 먼저 머지.
3. [ ] **Hover 인터랙션** — 기존 컴포넌트에 transition만 추가 → 마크업 변경 없음.
4. [ ] **ARIS acronym** — 마크업 1블록 추가.
5. [ ] **Layering :has 셀렉터 교체** — cmd-console / cursor spotlight 추가 전 사전 작업.
6. [ ] **cmd-console 추가** — 마크업 + CSS + JS (terminal scroll). 가장 무거움.
7. [ ] **Cursor spotlight** — 마지막에 cherry on top.

각 단계마다 PR 분리 권장. 1~3은 디자인-only이므로 빠르게 머지 가능, 4~7은 시각적 회귀 검토 필요.

---

## 12. 회귀 (Regression) 점검

- [ ] 기존 채팅 진입 / 새 채팅 시작 흐름.
- [ ] 사이드바 nav 클릭으로 진입점 전환.
- [ ] 프로젝트 카드 클릭 → Project 상세 진입.
- [ ] 다크 모드 토글 (`html[data-theme]` 변경).
- [ ] 키보드 단축키 (Cmd/Ctrl + N, Cmd/Ctrl + K 등).
- [ ] 모바일 햄버거 메뉴 / 좁은 뷰포트 레이아웃.

---

## 부록 — 참고 파일

| 파일 | 용도 |
|---|---|
| [`docs/design/aris-ia-v2.html`](./aris-ia-v2.html) | v2 베이스 — 변경 전 컴포넌트 spec |
| [`docs/design/aris-ia-v3.html`](./aris-ia-v3.html) | v3 시안 — 변경 후 풀-스크린 프로토타입 |
| [`docs/design/aris-newchat-btn-variants.html`](./aris-newchat-btn-variants.html) | New chat 버튼 6 variant 비교 (D안 채택) |

> 시안에서 보이는 동작과 다른 부분이 발견되면 v3.html을 정답으로 본다. 본 체크리스트는 시안 캡처 시점(`2026-04-25`)을 기준으로 작성됨.
