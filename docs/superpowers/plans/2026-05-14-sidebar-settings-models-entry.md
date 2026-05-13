# Sidebar Settings Entry + Models Wireup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 좌측 사이드바 푸터에 사용자 컨텍스트 메뉴(Settings/Theme/Sign out)를 추가하고, Settings를 풀-페이지 surface로 노출하면서 그 안의 Models 섹션이 채팅 selector와 동일한 canonical 카탈로그를 공유하도록 만든다.

**Architecture:** 기존 `app/SettingsTab.tsx`의 완성된 카드들을 `SettingsSurface` 컨테이너로 합성하고, 데이터 로딩은 `useProviderModels` 훅으로 추출해 ProjectChatSurface와 공유. selector는 hardcoded display label을 제거하고 `{ id, label, meta }` 구조로 canonical id를 상태로 들고 다닌다. 새 채팅 생성과 메시지 전송 후에 PATCH로 chat.model을 영속화한다.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS modules. 기존 `lib/theme/clientTheme.ts`, `lib/settings/providerModels.ts`, `lib/happy/modelPolicy.ts` 재사용. 테스트는 vitest + Next route handler 직접 호출.

---

## File Map

| Path | Responsibility | Status |
|---|---|---|
| `components/layout/SidebarFooterMenu.tsx` | 푸터 popover 메뉴 (Settings/Theme/Sign out) | Create |
| `components/layout/SidebarFooterMenu.module.css` | 메뉴 스타일 (위로 향하는 popover) | Create |
| `components/settings/SettingsSurface.tsx` | Settings 풀 surface (sub-nav + 본문) | Create |
| `components/settings/SettingsSurface.module.css` | surface 레이아웃 | Create |
| `components/settings/ModelsSection.tsx` | 기존 SettingsTab의 모델 부분 추출 | Create (extract) |
| `components/settings/SshSection.tsx` | 기존 SettingsTab의 SSH 부분 추출 | Create (extract) |
| `lib/settings/useProviderModels.ts` | settings 응답 로드/갱신 hook | Create (extract) |
| `app/SettingsTab.tsx` | 얇은 래퍼로 축소 또는 삭제 | Modify/Delete |
| `app/HomePageClient.tsx` | TabType 확장, surface 분기, 메뉴 연결, theme prop 전달 | Modify |
| `components/layout/BottomNav.tsx` | TabType 일치 (노출 X) | Modify (types only) |
| `components/project-chat/ProjectChatSurface.tsx` | MODEL_OPTIONS 제거, 동적 카탈로그, id 기반 state, PATCH 영속화 | Modify (large) |
| `services/aris-web/tests/sessionEventsRoute.test.ts` | canonical id 정합 회귀 케이스 추가 | Modify |
| `services/aris-web/tests/projectChatSurface.modelPersist.test.tsx` | PATCH 영속화 케이스 | Create |
| `services/aris-web/tests/useProviderModels.test.ts` | hook 단위 테스트 | Create |

---

## Phase 1: Sidebar Footer Menu (UI shell, no settings surface yet)

목표: 푸터에 메뉴 트리거가 보이고, Theme 변경/Sign out이 동작하며, Settings 항목은 클릭 시 일단 로그만 남기는 상태.

### Task 1.1: SidebarFooterMenu 컴포넌트 (UI only)

**Files:**
- Create: `services/aris-web/components/layout/SidebarFooterMenu.tsx`
- Create: `services/aris-web/components/layout/SidebarFooterMenu.module.css`

- [ ] **Step 1: 컴포넌트 스캐폴드**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { LogOut, Settings, Sun, Moon, Monitor, MoreHorizontal } from 'lucide-react';
import { withAppBasePath } from '@/lib/url/appBasePath';
import type { ThemeMode } from '@/lib/theme/clientTheme';
import styles from './SidebarFooterMenu.module.css';

interface Props {
  user: { email: string; role: string };
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onOpenSettings: () => void;
}

const THEME_ITEMS: Array<{ mode: ThemeMode; label: string; Icon: typeof Sun }> = [
  { mode: 'light', label: '라이트', Icon: Sun },
  { mode: 'dark', label: '다크', Icon: Moon },
  { mode: 'system', label: '시스템', Icon: Monitor },
];

export function SidebarFooterMenu({ user, themeMode, onThemeChange, onOpenSettings }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const userInitial = (user.email?.trim()?.[0] ?? 'A').toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.avatar}>{userInitial}</span>
        <span className={styles.identity}>
          <span className={styles.name}>{user.email.split('@')[0] || 'ARIS'}</span>
          <span className={styles.meta}>{user.role}</span>
        </span>
        <MoreHorizontal size={14} className={styles.chev} />
      </button>
      {open && (
        <div className={styles.panel} role="menu" aria-label="사용자 메뉴">
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => { setOpen(false); onOpenSettings(); }}
          >
            <Settings size={14} /> Settings
          </button>
          <div className={styles.section} role="group" aria-label="테마">
            <div className={styles.sectionLabel}>테마</div>
            <div className={styles.themeRow}>
              {THEME_ITEMS.map(({ mode, label, Icon }) => {
                const active = themeMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`${styles.themeChip}${active ? ' ' + styles.themeChipActive : ''}`}
                    onClick={() => onThemeChange(mode)}
                  >
                    <Icon size={12} /> {label}
                  </button>
                );
              })}
            </div>
          </div>
          <form action={withAppBasePath('/api/auth/logout')} method="POST" className={styles.signoutForm}>
            <button type="submit" role="menuitem" className={`${styles.item} ${styles.signout}`}>
              <LogOut size={14} /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 스타일**

```css
.root { position: relative; }
.trigger {
  display: grid; grid-template-columns: 28px 1fr 14px; gap: 10px; align-items: center;
  width: 100%; padding: 8px 10px; border-radius: 10px;
  background: transparent; border: 1px solid transparent; color: inherit; cursor: pointer;
}
.trigger:hover { background: var(--m-sb-hover, rgba(255,255,255,0.04)); }
.avatar {
  width: 28px; height: 28px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--m-sb-avatar, #2b2b2b); font-size: 12px; color: #fff;
}
.identity { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.name { font-size: 12.5px; font-weight: 600; line-height: 1.2; }
.meta { font-size: 10.5px; opacity: 0.6; line-height: 1.2; margin-top: 2px; }
.chev { opacity: 0.55; }
.panel {
  position: absolute; left: 8px; right: 8px; bottom: calc(100% + 6px);
  background: var(--m-sb-panel-bg, #14141a);
  border: 1px solid var(--m-sb-panel-border, rgba(255,255,255,0.08));
  border-radius: 10px; padding: 6px;
  box-shadow: 0 18px 40px rgba(0,0,0,0.45);
  z-index: 40;
  display: flex; flex-direction: column; gap: 2px;
}
.item {
  display: inline-flex; align-items: center; gap: 8px;
  width: 100%; padding: 8px 10px; border-radius: 8px;
  background: transparent; border: none; color: inherit;
  font: inherit; text-align: left; cursor: pointer;
}
.item:hover { background: rgba(255,255,255,0.05); }
.section { padding: 6px 8px 4px; }
.sectionLabel { font-size: 10.5px; opacity: 0.55; margin-bottom: 6px; }
.themeRow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.themeChip {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  padding: 6px 4px; border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.08);
  background: transparent; color: inherit; font-size: 11px; cursor: pointer;
}
.themeChipActive {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.18);
}
.signoutForm { margin: 0; }
.signout { color: #ff8585; }
```

- [ ] **Step 3: 컴파일 검증**

Run: `cd services/aris-web && npx tsc --noEmit -p tsconfig.json --skipLibCheck`
Expected: 신규 파일 에러 0.

- [ ] **Step 4: Commit**

```bash
git add services/aris-web/components/layout/SidebarFooterMenu.tsx services/aris-web/components/layout/SidebarFooterMenu.module.css
git commit -m "feat(sidebar): add user context menu component shell"
```

### Task 1.2: HomePageClient 푸터에 메뉴 연결 + Theme 상태 prop 전달

**Files:**
- Modify: `services/aris-web/app/HomePageClient.tsx` (footer block + theme prop wiring)

- [ ] **Step 1: 푸터 block 교체**

[HomePageClient.tsx:748-754] 의 `m-sb__footer` 블록을 다음으로 교체:

```tsx
<div className="m-sb__footer">
  <SidebarFooterMenu
    user={user}
    themeMode={themeMode}
    onThemeChange={changeThemeMode}
    onOpenSettings={() => onTabChange('settings')}
  />
</div>
```

- [ ] **Step 2: import 추가**

상단 import 그룹에 추가:

```tsx
import { SidebarFooterMenu } from '@/components/layout/SidebarFooterMenu';
```

- [ ] **Step 3: Sidebar props 시그니처에 theme 추가**

`Sidebar` 컴포넌트 props 타입과 호출부에 `themeMode: ThemeMode`, `onThemeChange: (mode: ThemeMode) => void` 추가. HomePageClient 함수에서 이미 갖고 있는 `themeMode`, `changeThemeMode`를 Sidebar에 prop으로 내려준다.

- [ ] **Step 4: TabType에 'settings' 추가 (선행)**

`components/layout/BottomNav.tsx`의 `TabType` 정의를 다음으로 교체:

```tsx
export type TabType = 'home' | 'ask' | 'project' | 'files' | 'settings';
```

`tabs` 배열은 그대로 유지 — settings는 BottomNav에 노출하지 않는다. `navItems` 배열([HomePageClient.tsx:626])도 그대로 유지.

- [ ] **Step 5: HomePageClient의 normalizeTab/syncFromSearch 'settings' 분기 추가**

검색 파라미터 `?tab=settings`를 인식하도록 `normalizeTab` switch에 케이스 추가. 메인 surface 분기(`activeTab === 'ask'`/... 체인)에 임시로 다음 추가:

```tsx
if (activeTab === 'settings') return <div data-test="settings-placeholder">Settings (TBA Task 3.1)</div>;
```

- [ ] **Step 6: 컴파일 + 빠른 시각 확인**

Run: `cd services/aris-web && npx tsc --noEmit`
Expected: 0 errors.

Run: dev 서버에서 사이드바 푸터 클릭 → 메뉴 열림, Theme 변경 시 즉시 적용, Sign out form은 logout 호출. Settings 클릭 시 메인이 "Settings (TBA Task 3.1)" 출력.

- [ ] **Step 7: Commit**

```bash
git add services/aris-web/app/HomePageClient.tsx services/aris-web/components/layout/BottomNav.tsx
git commit -m "feat(sidebar): wire footer menu, theme prop, and settings tab routing"
```

---

## Phase 2: Settings Surface 컨테이너 (Models 섹션 추출 + sub-nav)

목표: `?tab=settings`로 진입 시 기존 SettingsTab의 카드들이 SettingsSurface 안에서 렌더되고 sub-nav에 Models / SSH가 노출.

### Task 2.1: useProviderModels 훅 추출

**Files:**
- Create: `services/aris-web/lib/settings/useProviderModels.ts`
- Create: `services/aris-web/tests/useProviderModels.test.ts`

- [ ] **Step 1: 기존 SettingsTab의 데이터 로드 코드 식별**

[`app/SettingsTab.tsx`](services/aris-web/app/SettingsTab.tsx)에서 다음을 식별:
- modelSettings state + setter
- 카탈로그 load(`fetch('/api/settings/...')`) 호출들
- save/delete 핸들러는 그대로 두고 **로드 부분만** 훅으로 추출

- [ ] **Step 2: 훅 시그니처 작성 (테스트 먼저)**

```ts
// tests/useProviderModels.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { useProviderModels } from '@/lib/settings/useProviderModels';

describe('useProviderModels', () => {
  it('로드 성공 시 settings를 반환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      providers: { codex: { selectedModelIds: ['gpt-5-mini'], defaultModelId: 'gpt-5-mini' } },
      legacyCustomModels: { codex: '' },
      secrets: { openAiApiKeyConfigured: true },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useProviderModels());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.providers.codex.defaultModelId).toBe('gpt-5-mini');
  });

  it('실패 시 error를 노출한다', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('boom', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useProviderModels());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });
});
```

Run: `cd services/aris-web && npm test -- --run tests/useProviderModels.test.ts`
Expected: FAIL with "useProviderModels not found".

- [ ] **Step 3: 훅 구현**

```ts
'use client';
import { useEffect, useState } from 'react';
import { withAppBasePath } from '@/lib/url/appBasePath';
import type { ModelSettingsResponse } from './providerModels';

export function useProviderModels() {
  const [data, setData] = useState<ModelSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetch(withAppBasePath('/api/settings/models'), { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  return { data, loading, error, reload };
}
```

Run: `cd services/aris-web && npm test -- --run tests/useProviderModels.test.ts`
Expected: PASS.

- [ ] **Step 4: 엔드포인트 확인**

기존 `/api/settings/models` 라우트가 `ModelSettingsResponse` 모양을 반환하는지 코드 확인. 다르면 SettingsTab이 부르는 경로를 그대로 따라가도록 훅을 조정.

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/lib/settings/useProviderModels.ts services/aris-web/tests/useProviderModels.test.ts
git commit -m "feat(settings): extract useProviderModels hook with tests"
```

### Task 2.2: ModelsSection 추출

**Files:**
- Create: `services/aris-web/components/settings/ModelsSection.tsx`
- Modify: `services/aris-web/app/SettingsTab.tsx`

- [ ] **Step 1: SettingsTab의 모델 부분만 ModelsSection.tsx로 옮긴다**

`SettingsTab.tsx`에서:
- 모든 `*Catalog*`, `*ModelIds`, `*ModelFeedback`, `*KeySaving` state
- 카탈로그 로드 effect들
- save/delete 핸들러
- JSX 안의 `<OpenAiApiKeyCard />` + `<CodexModelCatalogCard />` 블록

→ `components/settings/ModelsSection.tsx`로 그대로 이동. props는 받지 않고 자체적으로 `useProviderModels()` 호출 후 응답을 카드들에 전달.

- [ ] **Step 2: 추출 후 컴파일**

Run: `cd services/aris-web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add services/aris-web/components/settings/ModelsSection.tsx services/aris-web/app/SettingsTab.tsx
git commit -m "refactor(settings): extract ModelsSection from SettingsTab"
```

### Task 2.3: SshSection 추출

**Files:**
- Create: `services/aris-web/components/settings/SshSection.tsx`
- Modify: `services/aris-web/app/SettingsTab.tsx`

- [ ] **Step 1: SSH state/handlers/UI를 SshSection으로 이동**

`SettingsTab.tsx`의 `sshUser`, `sshPrivateKey`, `hasKey`, `fileName`, `dragOver`, `showTextInput`, `saving`, `feedback`, `fileInputRef`, 모든 SSH 관련 handler/effect, JSX 블록을 새 파일로 이동.

- [ ] **Step 2: Commit**

```bash
git add services/aris-web/components/settings/SshSection.tsx services/aris-web/app/SettingsTab.tsx
git commit -m "refactor(settings): extract SshSection from SettingsTab"
```

### Task 2.4: SettingsSurface 컨테이너

**Files:**
- Create: `services/aris-web/components/settings/SettingsSurface.tsx`
- Create: `services/aris-web/components/settings/SettingsSurface.module.css`
- Modify: `services/aris-web/app/HomePageClient.tsx`

- [ ] **Step 1: SettingsSurface 작성**

```tsx
'use client';

import { useState } from 'react';
import { Cpu, KeyRound } from 'lucide-react';
import { ModelsSection } from './ModelsSection';
import { SshSection } from './SshSection';
import styles from './SettingsSurface.module.css';

type Section = 'models' | 'ssh';

const ITEMS: Array<{ id: Section; label: string; Icon: typeof Cpu }> = [
  { id: 'models', label: 'Models', Icon: Cpu },
  { id: 'ssh', label: 'SSH', Icon: KeyRound },
];

export function SettingsSurface() {
  const [section, setSection] = useState<Section>('models');
  return (
    <div className={styles.shell}>
      <aside className={styles.nav} aria-label="Settings sub-navigation">
        {ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`${styles.navItem}${section === id ? ' ' + styles.navItemActive : ''}`}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => setSection(id)}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </aside>
      <div className={styles.body}>
        {section === 'models' ? <ModelsSection /> : <SshSection />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 스타일**

```css
.shell { display: grid; grid-template-columns: 220px 1fr; gap: 24px; padding: 24px; max-width: 1100px; margin: 0 auto; }
.nav { display: flex; flex-direction: column; gap: 4px; padding-top: 8px; }
.navItem {
  display: inline-flex; align-items: center; gap: 8px;
  width: 100%; padding: 8px 10px; border-radius: 8px;
  background: transparent; border: 1px solid transparent; color: inherit;
  cursor: pointer; font: inherit; text-align: left;
}
.navItem:hover { background: rgba(255,255,255,0.04); }
.navItemActive {
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.08);
}
.body { min-width: 0; }

@media (max-width: 768px) {
  .shell { grid-template-columns: 1fr; padding: 16px; gap: 12px; }
  .nav { flex-direction: row; overflow-x: auto; }
  .navItem { white-space: nowrap; }
}
```

- [ ] **Step 3: HomePageClient에서 Settings placeholder 제거**

이전 Task 1.2의 placeholder를:

```tsx
if (activeTab === 'settings') return <SettingsSurface />;
```

로 교체하고 `import { SettingsSurface } from '@/components/settings/SettingsSurface';` 추가.

- [ ] **Step 4: 컴파일 + dev 시각 확인**

Run: `cd services/aris-web && npx tsc --noEmit`. dev 서버에서 사이드바 푸터 → Settings → Models/SSH sub-nav 동작 확인.

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/components/settings/SettingsSurface.tsx services/aris-web/components/settings/SettingsSurface.module.css services/aris-web/app/HomePageClient.tsx
git commit -m "feat(settings): add SettingsSurface with Models/SSH sub-nav"
```

### Task 2.5: 기존 SettingsTab.tsx 정리

**Files:**
- Modify or Delete: `services/aris-web/app/SettingsTab.tsx`

- [ ] **Step 1: 참조 확인**

Run: `grep -rn "SettingsTab" services/aris-web --include="*.ts" --include="*.tsx" | grep -v node_modules`
이전 추출로 SettingsTab은 더 이상 본체가 없거나 빈 껍질일 것. 다른 곳에서 import되지 않으면 삭제.

- [ ] **Step 2: 삭제 또는 SettingsSurface re-export로 축소**

미사용이면:
```bash
git rm services/aris-web/app/SettingsTab.tsx services/aris-web/app/SettingsTab.module.css
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(settings): remove orphan SettingsTab (replaced by SettingsSurface)"
```

---

## Phase 3: Chat Selector Canonical Wireup

목표: ProjectChatSurface가 동적 카탈로그를 사용하고, selector state가 canonical id를 들고 다니며, `meta.model`이 `source: 'requested'`로 통과되도록 한다.

### Task 3.1: 회귀 가드 테스트 작성 (먼저 빨강)

**Files:**
- Modify: `services/aris-web/tests/sessionEventsRoute.test.ts`

- [ ] **Step 1: 케이스 추가**

기존 테스트 파일 끝에 다음을 추가:

```ts
it('display label("Opus 4.7")이 오면 fallback되어야 한다 (회귀 가드)', async () => {
  // existing test harness: build request with meta.model='Opus 4.7'
  const result = await postEvent({ meta: { model: 'Opus 4.7', agent: 'claude' } });
  expect(result.resolvedModelSource).toBe('default'); // 또는 'requested_disallowed' 표기에 맞춰
});

it('canonical id("claude-sonnet-4-6")이 오면 requested로 통과한다', async () => {
  const result = await postEvent({ meta: { model: 'claude-sonnet-4-6', agent: 'claude' } });
  expect(result.resolvedModelSource).toBe('requested');
  expect(result.resolvedModel).toBe('claude-sonnet-4-6');
});
```

기존 테스트의 helper 이름/시그니처에 맞춰 보정.

Run: `cd services/aris-web && npm test -- --run tests/sessionEventsRoute.test.ts`
Expected: 두 케이스 PASS (서버 동작은 이미 맞음 — 이 테스트는 향후 리팩토링 회귀 방지용).

- [ ] **Step 2: Commit**

```bash
git add services/aris-web/tests/sessionEventsRoute.test.ts
git commit -m "test(events): pin requested vs fallback semantics for meta.model"
```

### Task 3.2: ProjectChatSurface에 useProviderModels 도입 + 옵션 리스트 도출

**Files:**
- Modify: `services/aris-web/components/project-chat/ProjectChatSurface.tsx`

- [ ] **Step 1: hardcoded `MODEL_OPTIONS` 삭제 + 동적 옵션 hook 사용**

[ProjectChatSurface.tsx:79-94]의 `MODEL_OPTIONS` 상수를 제거하고, 컴포넌트 본문에 다음을 도입:

```tsx
const { data: modelSettings } = useProviderModels();

const providerOptions = useMemo<Record<ModelProvider, Array<{ id: string; label: string; meta?: string }>>>(() => {
  const empty: Record<ModelProvider, Array<{ id: string; label: string; meta?: string }>> = {
    claude: [], codex: [], gemini: [],
  };
  if (!modelSettings) return empty;
  const toOptions = (providerId: ModelProvider) => {
    const p = modelSettings.providers[providerId];
    const selected = (p?.selectedModelIds ?? []).map((id) => ({ id, label: id }));
    const legacy = (modelSettings.legacyCustomModels?.[providerId] ?? '').trim();
    const legacyOption = legacy ? [{ id: legacy, label: legacy, meta: 'custom' }] : [];
    return [...selected, ...legacyOption];
  };
  return {
    claude: toOptions('claude'),
    codex: toOptions('codex'),
    gemini: toOptions('gemini'),
  };
}, [modelSettings]);
```

- [ ] **Step 2: Fallback 카탈로그**

빈 provider에 대해 builtin fallback을 노출:

```tsx
import { BUILTIN_MODELS_BY_AGENT } from '@/lib/happy/modelPolicy';
// 주의: 'server-only' import 라면 클라이언트용 사본을 lib/happy/modelPolicyClient.ts에 둔다.
```

`modelPolicy.ts`는 server-only이므로 클라이언트 사본을 만들어야 한다(파일 상단의 `import 'server-only';` 때문). 사본:

```ts
// services/aris-web/lib/happy/modelPolicyClient.ts
export const BUILTIN_FALLBACK: Record<'claude'|'codex'|'gemini', string[]> = {
  codex: ['gpt-5.4', 'gpt-5.3-codex', 'gpt-5.3-codex-spark', 'gpt-5', 'gpt-5-mini'],
  claude: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'],
  gemini: ['auto-gemini-3', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
};
```

`providerOptions`에서 selected가 비었으면 fallback을 사용:

```tsx
const list = toOptions(providerId);
return list.length > 0 ? list : BUILTIN_FALLBACK[providerId].map((id) => ({ id, label: id, meta: 'builtin' }));
```

- [ ] **Step 3: state를 id 기반으로 전환**

`const [selectedModel, setSelectedModel] = useState(runtimeModelLabel);` 를 다음으로 교체:

```tsx
const [selectedModelId, setSelectedModelId] = useState<string>(() =>
  activeChat?.model ?? modelSettings?.providers[providerFromAgent(runtimeAgent)]?.defaultModelId ?? ''
);
const activeModelLabel = selectedModelId || ''; // 라벨은 옵션에서 룩업
```

기존 `runtimeModelLabel`, `setSelectedModel(model.name)` 참조를 전수 교체:
- selector 클릭: `setSelectedModelId(option.id)`
- provider 전환: `setSelectedModelId(providerOptions[provider][0]?.id ?? '')`
- 표시: `<span className="ms__item-name">{option.label}</span>`, `<span className="ms__item-meta">{option.meta ?? ''}</span>`

- [ ] **Step 4: payload에 id 사용**

[ProjectChatSurface.tsx:815]의 `model: activeModelLabel`를 `model: selectedModelId`로 교체. terminal payload도 동일.

- [ ] **Step 5: createChat에 id 전달**

[ProjectChatSurface.tsx:762] 변경:

```tsx
const projectModelInput = normalizeProjectChatModelInput(selectedModelId ?? session.model ?? session.metadata?.runtimeModel);
```

- [ ] **Step 6: 컴파일 + 시각 확인**

Run: `cd services/aris-web && npx tsc --noEmit`
Expected: 0 errors.

dev 서버에서 채팅 진입 → selector가 Settings에서 켠 모델만 노출 (Settings에서 아무것도 안 켰으면 builtin fallback) 확인.

- [ ] **Step 7: Commit**

```bash
git add services/aris-web/components/project-chat/ProjectChatSurface.tsx services/aris-web/lib/happy/modelPolicyClient.ts
git commit -m "feat(project-chat): switch selector to canonical id with dynamic catalog"
```

### Task 3.3: 채팅 model PATCH 영속화

**Files:**
- Modify: `services/aris-web/components/project-chat/ProjectChatSurface.tsx`
- Create: `services/aris-web/tests/projectChatSurface.modelPersist.test.tsx`

- [ ] **Step 1: 회귀 테스트 먼저**

```tsx
// tests/projectChatSurface.modelPersist.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProjectChatSurface } from '@/components/project-chat/ProjectChatSurface';

it('메시지 전송 후 chat.model이 PATCH로 영속화된다', async () => {
  const fetchMock = vi.fn().mockImplementation((url, init) => {
    if (typeof url === 'string' && url.includes('/api/settings/models')) {
      return Promise.resolve(new Response(JSON.stringify({
        providers: { claude: { selectedModelIds: ['claude-sonnet-4-6'], defaultModelId: 'claude-sonnet-4-6' } },
        legacyCustomModels: { claude: '' }, secrets: { claudeApiKeyConfigured: true },
      }), { status: 200 }));
    }
    if (typeof url === 'string' && /\/events$/.test(url)) {
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<ProjectChatSurface session={mockSession({ agent: 'claude' })} activeChat={mockChat({ model: 'claude-haiku-4-5' })} /* ... */ />);

  fireEvent.click(screen.getByRole('button', { name: /open model selector/i }));
  fireEvent.click(screen.getByRole('button', { name: /claude-sonnet-4-6/i }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
  fireEvent.submit(screen.getByRole('form'));

  await waitFor(() => {
    const patch = fetchMock.mock.calls.find(([url, init]) =>
      typeof url === 'string' && /\/chats\/[^/]+$/.test(url) && init?.method === 'PATCH'
    );
    expect(patch).toBeTruthy();
    expect(JSON.parse(patch![1]!.body as string)).toMatchObject({ model: 'claude-sonnet-4-6' });
  });
});
```

mockSession/mockChat 헬퍼는 기존 테스트 디렉터리 패턴에 맞춰 작성.

Run: 테스트 실패 확인 (PATCH 호출이 아직 없음).

- [ ] **Step 2: PATCH 구현**

`handleSubmit`의 POST 성공 직후 다음 블록 추가:

```tsx
if (chat && selectedModelId && chat.model !== selectedModelId) {
  await fetch(withAppBasePath(`/api/runtime/sessions/${encodeURIComponent(session.id)}/chats/${encodeURIComponent(chat.id)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: selectedModelId,
      modelReasoningEffort: serializeReasoningEffort(selectedEffort),
    }),
  }).catch(() => { /* non-fatal */ });
  setChats((prev) => prev.map((c) => c.id === chat.id ? { ...c, model: selectedModelId } : c));
}
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `cd services/aris-web && npm test -- --run tests/projectChatSurface.modelPersist.test.tsx`
Expected: PASS.

- [ ] **Step 4: 채팅 진입 시 chat.model로 selector 복원**

[ProjectChatSurface.tsx:589]의 `setSelectedModel(runtimeModelLabel);` 효과를 다음으로 교체:

```tsx
useEffect(() => {
  if (!activeChat?.model) return;
  setSelectedModelId(activeChat.model);
}, [activeChat?.id, activeChat?.model]);
```

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/components/project-chat/ProjectChatSurface.tsx services/aris-web/tests/projectChatSurface.modelPersist.test.tsx
git commit -m "feat(project-chat): persist chat.model on submit and restore on entry"
```

---

## Phase 4: 정리, 검증, PR

### Task 4.1: 전체 타입체크 + 영향 받은 테스트 통과

- [ ] **Step 1: 타입체크**

Run: `cd services/aris-web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: 영향 테스트 통과**

Run:
```
cd services/aris-web && npm test -- --run \
  tests/sessionEventsRoute.test.ts \
  tests/useProviderModels.test.ts \
  tests/projectChatSurface.modelPersist.test.tsx
```
Expected: all PASS.

- [ ] **Step 3: 빠른 스모크 — 빌드 (선택, 시간 허락 시)**

Run: `cd services/aris-web && npm run build` (백그라운드 권장)

### Task 4.2: 수동 E2E 체크리스트

- [ ] dev 서버 기동 + 브라우저 진입 (`https://aris.lawdigest.cloud` 또는 로컬)
- [ ] 사이드바 푸터 → 메뉴 열림, Theme 3-way 동작, Sign out submit
- [ ] 메뉴 → Settings → URL `?tab=settings`, Models/SSH sub-nav 동작
- [ ] Settings → Models에서 키 등록/모델 토글/기본 모델 설정 — 기존 SettingsTab 동작 회귀 0
- [ ] Project chat 진입 → selector가 Settings에서 켠 모델만 노출 (없으면 builtin fallback)
- [ ] 모델 선택 → 메시지 전송 → 새로고침 → 같은 모델 유지
- [ ] BottomNav 4탭 그대로 (settings 미노출)

### Task 4.3: PR 생성 + 자동 머지/배포

- [ ] **Step 1: push**

```bash
git push -u origin feat/sidebar-settings-models-entry
```

- [ ] **Step 2: PR 생성 (gh)**

```bash
gh pr create --title "feat(sidebar): user context menu + Settings surface + canonical model wireup" --body "$(cat <<'EOF'
## Summary
- 좌측 사이드바 푸터에 Settings/Theme/Sign out 컨텍스트 메뉴 추가
- Settings 풀-페이지 surface 노출 (`?tab=settings`), Models/SSH sub-nav
- 채팅 selector를 canonical id로 정렬하고 chat.model을 PATCH로 영속화

## Test plan
- [ ] `npm test -- --run tests/sessionEventsRoute.test.ts tests/useProviderModels.test.ts tests/projectChatSurface.modelPersist.test.tsx`
- [ ] 사이드바 푸터 메뉴 → Settings/Theme/Sign out
- [ ] Settings에서 모델 토글 → 채팅 selector 반영 → 메시지 후 새로고침 시 유지
- [ ] BottomNav 4탭 그대로

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: 머지 + 배포 모니터링 (자동)**

PR가 merge되면 main 배포 hook이 자동 트리거된다. 실패 시 issue를 열어 후속 처리.

---

## Verification Summary

테스트가 통과하고 다음 조건이 모두 충족되면 완료:

1. `tsc --noEmit` 0 에러.
2. 새/수정 테스트 3개 PASS:
   - `tests/sessionEventsRoute.test.ts` (canonical id → requested, label → fallback)
   - `tests/useProviderModels.test.ts`
   - `tests/projectChatSurface.modelPersist.test.tsx`
3. 수동 E2E 체크리스트(Task 4.2) 7개 항목 통과.
4. PR 머지 후 배포 서버에서 같은 시나리오 1회 재확인.

## 의도적 비-목표(이번 PR 밖)

- `config/model-policy.json`의 builtin 카탈로그 버전 정렬(예: `claude-opus-4-7` 추가).
- 모바일 BottomNav 5번째 자리.
- Settings 내 추가 섹션(Notifications/Account 등).
- `MODEL_OPTIONS`/`PROVIDER_LABELS` 같은 잔여 상수 삭제는 ProjectChatSurface 변경 범위 안에서만 처리.
