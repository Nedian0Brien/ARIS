# 사이드바 푸터 메뉴 + Settings surface + Models 섹션 + Chat selector canonical wireup

작성일: 2026-05-14
브랜치: `feat/sidebar-settings-models-entry`

## Context (왜 하는가)

채팅의 모델 selector는 사용자가 클릭해도 실제 실행 모델에 안정적으로 연결되지 않는다.

- [ProjectChatSurface.tsx:79-94](services/aris-web/components/project-chat/ProjectChatSurface.tsx#L79-L94)의 `MODEL_OPTIONS`는 display label(`Opus 4.7`, `GPT-5 mini`, `Gemini 3 Pro` …)만 들고 있고, 이 라벨이 그대로 [ProjectChatSurface.tsx:815](services/aris-web/components/project-chat/ProjectChatSurface.tsx#L815) `meta.model`로 POST된다.
- 반면 서버의 [modelPolicy.ts:11-15](services/aris-web/lib/happy/modelPolicy.ts#L11-L15)의 `BUILTIN_MODELS_BY_AGENT`는 canonical id(`claude-opus-4-6`, `gpt-5-mini`, `auto-gemini-3` …)만 허용해서, selector 값은 매번 `resolveRuntimeMessageModel`에서 fallback 처리된다.
- 새 채팅 생성 시 [ProjectChatSurface.tsx:762](services/aris-web/components/project-chat/ProjectChatSurface.tsx#L762)는 `selectedModel`이 아니라 `session.model`만 쓰고, 전송 후 chat에 model을 PATCH로 저장하지도 않는다. 채팅 PATCH API는 model 필드를 받지만([chats/[chatId]/route.ts:27](services/aris-web/app/api/runtime/sessions/[sessionId]/chats/[chatId]/route.ts#L27)) 호출 측이 보내지 않는다.

동시에 키 등록·모델 카탈로그·테마 같은 사용자 수준 설정의 진입점이 일관적이지 않다.

- [`app/SettingsTab.tsx`](services/aris-web/app/SettingsTab.tsx)는 700+라인의 완성된 settings surface인데 **어디서도 import되지 않은 orphan**이다.
- 테마 토글은 Topbar의 `m-context-menu` 안에만 있고([HomePageClient.tsx:895-935](services/aris-web/app/HomePageClient.tsx#L895-L935)), 사이드바에는 사용자 메뉴가 없다.
- 사이드바 푸터는 avatar+이메일만 표시할 뿐 동작이 없다([HomePageClient.tsx:748-754](services/aris-web/app/HomePageClient.tsx#L748-L754)).

## Goals

1. 좌측 사이드바 푸터에 사용자 컨텍스트 메뉴 추가: **Settings**, **Theme**, **Sign out**.
2. **Settings**를 풀 페이지 surface로 노출 (`?tab=settings`). BottomNav에는 미노출 (4탭 구조 유지).
3. Settings 안에 **Models 섹션**을 두고, 기존 `SettingsTab.tsx`의 카드들을 재사용해서 프로바이더 키·카탈로그·기본 모델을 관리한다.
4. 채팅 selector의 데이터 모델을 **canonical id + display label**로 분리. 사용자가 Settings에서 켠 모델만 selector에 등장. selector가 보내는 값은 canonical id.
5. 새 채팅 생성·전송 시 `selectedModel`(canonical id)을 chat에 영속화. 채팅 진입 시 chat.model로 selector 상태 복원.

## Non-goals

- 모바일 BottomNav 변경 (별도 작업).
- Settings 내 SSH/알림/계정 등 새 섹션 추가 — 자리만 비워둠.
- 새 모델 프로바이더 추가.
- 빌트인 모델 카탈로그(`config/model-policy.json`)의 업그레이드(예: `claude-opus-4-7` 추가) — 별도 PR에서 다룸. 이번 PR은 데이터 모델 정합만 잡고, 카탈로그는 동적 카탈로그(`providerModels`)에 기반한다.

## 아키텍처

### IA & 라우팅
- `TabType`(현재 `home | ask | project | files`)에 `'settings'`를 **추가하되 BottomNav `tabs` 배열에는 노출하지 않는다**(`components/layout/BottomNav.tsx`). 사이드바 nav 항목(`navItems`)에도 노출하지 않는다.
- URL은 기존 패턴 그대로 `?tab=settings`. `HomePageClient.tsx`의 `normalizeTab`/`syncFromSearch` 로직을 settings까지 인식하도록 확장.
- Settings는 메인 영역만 전환되고 사이드바와 BottomNav는 그대로 보인다.

### 사이드바 푸터 컨텍스트 메뉴
- 새 컴포넌트 `components/layout/SidebarFooterMenu.tsx`. 기존 `m-context-menu` 마크업/이벤트 패턴(Topbar)을 참고하되 사이드바 푸터 컨텍스트에 맞게 위로 향하는 popover로 구현.
- 메뉴 항목:
  - **Settings** → `onTabChange('settings')`
  - **Theme** → 하위 라디오 그룹 (라이트/다크/시스템) — 기존 `THEME_OPTIONS` + `applyTheme`/`readThemeMode`([clientTheme.ts](services/aris-web/lib/theme/clientTheme.ts)) 그대로 재사용. Topbar의 테마 섹션과 동일 상태를 공유하기 위해 `themeMode`/`changeThemeMode`를 HomePageClient에서 prop으로 내려준다.
  - **Sign out** → 기존 `/api/auth/logout` POST 폼 패턴([Header.tsx:321](services/aris-web/components/layout/Header.tsx#L321)) 재사용. 메뉴 항목을 form submit 트리거로 구현.
- 푸터 클릭 영역: 기존 avatar+이메일 row를 button으로 감싸 메뉴 트리거. 키보드 접근성: `aria-haspopup`, `aria-expanded`, ESC 닫힘, 외부 클릭 닫힘.

### Settings surface
- 진입점 컴포넌트 `components/settings/SettingsSurface.tsx`(신규)가 `app/SettingsTab.tsx`의 본체를 감싸고 좌측에 sub-nav를 둔다(현재는 `Models` 단일). 향후 `SSH`, `Notifications` 등 섹션 추가에 대비해 sub-nav를 미리 잡되, 비어 있는 섹션은 만들지 않는다(YAGNI).
- 기존 `SettingsTab` 본체를 그대로 두지 않고 `ModelsSection`으로 잘라낸다:
  - SSH 관련 state/UI는 보존하되 별도 컴포넌트(`SshSection`)로 분리 — sub-nav의 두 번째 섹션으로 노출하거나, 이번 PR에서는 같은 페이지에 뒤이어 노출 후 차후 PR에서 sub-nav로 옮긴다(점진적). 결정: **이번 PR에서는 Models 섹션만 sub-nav에 노출, SSH는 같은 surface 아래 별도 카드 그룹으로 두어 회귀 0**.
- `HomePageClient.tsx`의 surface 분기(`activeTab === 'ask'/'project'/'files'`)에 `settings` 분기를 추가하고 `<SettingsSurface />` 렌더.

### Chat selector ↔ Settings.Models 연결
- 카탈로그 단일 진실 공급원: `lib/settings/providerModels.ts`의 `ModelSettingsResponse`. 사용자별 `selectedModelIds`(켜둔 모델), `defaultModelId`(기본), `legacyCustomModels`(커스텀 id)가 이미 있음.
- ProjectChatSurface는 mount 시 `GET /api/settings/models` (또는 동등 endpoint)로 사용자 모델 설정을 로드. 기존 SettingsTab가 쓰는 hook/loader가 있다면 추출해서 공유 hook(`useProviderModels`)으로 만든다.
- selector의 옵션 목록: 사용자가 켠 `selectedModelIds` ∪ `legacyCustomModels[provider]`를 provider별로 그룹핑해서 `{ id, label, meta }`로 렌더. label은 카탈로그의 `displayName`(또는 id) — `MODEL_OPTIONS` 하드코드는 **삭제**.
- selector state는 id를 저장(`selectedModelId: string`). 표시할 때만 label로 매핑. 전송 payload `meta.model`에 id를 그대로 넣는다.
- 비어 있는 경우(아직 키 미등록 등) UX: 빌트인 fallback 카탈로그(`BUILTIN_MODELS_BY_AGENT` from `modelPolicy`)를 노출하고, 상단에 "Settings에서 프로바이더 키를 등록하세요" 미니 콜아웃 + Settings 진입 링크.

### 채팅 단위 모델 영속화
- `createChat` 호출 시 `model: selectedModelId` 전달 ([chats/route.ts]의 POST가 model을 받는지 확인 후 보정 — 받으면 그대로, 미수용이면 후속 PATCH).
- `handleSubmit` 성공 후, `chat.model !== selectedModelId`이면 `PATCH /api/runtime/sessions/{sessionId}/chats/{chatId}` 호출해서 `{ model, modelReasoningEffort }` 저장. PATCH는 이미 model을 받는다([chats/[chatId]/route.ts:27](services/aris-web/app/api/runtime/sessions/[sessionId]/chats/[chatId]/route.ts#L27)).
- 채팅 진입 시 `activeChat.model`로 `selectedModelId` 초기화 (이미 라인 382/589에 비슷한 동기화가 있으나 label 기준이라 id 기준으로 교체).

## 데이터 계약

### POST `/api/runtime/sessions/:id/events` (변경 없음, 사용 방식만 정합)
- 클라이언트는 `meta.model`에 **canonical id**(`claude-sonnet-4-6`, `gpt-5-mini`, `auto-gemini-3` 또는 커스텀 id)만 보낸다.
- 서버의 `resolveRuntimeMessageModel`은 그대로. 결과는 `source: 'requested'`가 되어야 한다.

### PATCH `/api/runtime/sessions/:id/chats/:chatId` (변경 없음, 호출 측 추가)
- `model`, `modelReasoningEffort` 필드를 selector 상태 변경/메시지 전송 시점에 보낸다.

### 사용자 모델 설정 로드 (기존 활용)
- `GET /api/settings/models` (또는 SettingsTab이 현재 부르는 엔드포인트)에서 `ModelSettingsResponse` 반환. ProjectChatSurface는 이 응답을 selector 옵션의 단일 진실 공급원으로 쓴다. **별도 신규 API 없음**.

## 컴포넌트 분할 요약

| 경로 | 역할 | 신규/수정 |
|---|---|---|
| `components/layout/SidebarFooterMenu.tsx` | 푸터 popover 메뉴 (Settings/Theme/Sign out) | 신규 |
| `components/layout/SidebarFooterMenu.module.css` | 메뉴 스타일 | 신규 |
| `components/settings/SettingsSurface.tsx` | Settings 풀 surface(컨테이너 + sub-nav) | 신규 |
| `components/settings/ModelsSection.tsx` | `SettingsTab`의 모델 부분 추출 | 신규(추출) |
| `components/settings/SshSection.tsx` | `SettingsTab`의 SSH 부분 추출(선택, 이번 PR에서는 동일 surface 내 별 컴포넌트) | 신규(추출) |
| `app/SettingsTab.tsx` | 위 두 섹션을 합성하는 얇은 래퍼로 축소 (호환용으로 유지)하거나 삭제 후 SettingsSurface로 교체 | 수정/삭제 |
| `app/HomePageClient.tsx` | `TabType` 확장, navItems/BottomNav에는 미노출, surface 분기 추가, footer 메뉴 트리거 연결, themeMode prop 전달 | 수정 |
| `components/layout/BottomNav.tsx` | `TabType` import 정합 (추가 노출 X) | 수정(타입) |
| `components/project-chat/ProjectChatSurface.tsx` | `MODEL_OPTIONS` 제거, 동적 카탈로그 hook 사용, id 기반 state, PATCH 영속화 | 수정(큰) |
| `components/project-chat/useProviderModels.ts` 또는 `lib/settings/useProviderModels.ts` | settings 로드 hook (SettingsTab의 로직 추출) | 신규 |
| `lib/happy/modelPolicy.ts` | 변경 없음 (보너스: builtin 카탈로그 corrections는 별도 PR) | 없음 |

## Verification

1. **Unit**
   - `useProviderModels`가 응답 정상화/에러 fallback 동작.
   - selector가 `{ id, label }` 옵션으로 렌더되고, id가 변경되면 state가 id만 보관.
2. **Integration (route)**
   - `tests/sessionEventsRoute.test.ts`에 사례 추가: 클라이언트가 보낸 `meta.model = 'claude-sonnet-4-6'`이 `source: 'requested'`로 통과. 잘못된 라벨(`'Opus 4.7'`)은 `requested_disallowed`로 fallback (기존 동작 보존).
   - PATCH chat의 model 영속화 회귀 테스트.
3. **E2E 수동 시나리오**
   - 사이드바 푸터 메뉴 → Settings 진입, URL `?tab=settings`.
   - Settings → Models에서 Codex key 등록 → 카탈로그 모델 토글 → 기본 모델 지정.
   - Project chat 진입 → selector가 Settings에서 켠 모델만 보이는지.
   - 모델 선택 → 메시지 전송 → 새로고침 → selector가 같은 모델 유지.
   - 사이드바 푸터 메뉴 → Theme 변경 → 즉시 적용, Topbar 테마와 동일 동기화.
   - 사이드바 푸터 메뉴 → Sign out → 로그아웃.
4. **접근성**
   - 푸터 메뉴 키보드 탐색(Tab, Arrow, Enter, Esc) 동작.
   - `aria-haspopup="menu"`, `aria-expanded`, `role="menuitem"` 정합.
5. **모바일**
   - BottomNav 4탭 그대로, settings 항목 미노출 확인.
   - 사이드바가 모바일에서 어떻게 열리는지 검사(기존 동작 회귀 0). Settings surface는 모바일에서 sub-nav가 stack되도록.

## 위험 / 트레이드오프

- **Orphan `SettingsTab.tsx` 추출 비용**: 컴포넌트를 잘게 나누면서 기존 동작이 깨질 위험. 대응: 이번 PR에서는 컴포넌트 분리 폭을 최소화(파일 하나 → 두 개)하고, ssh state는 통째로 새 파일에 옮기는 식으로 회귀 위험을 줄인다.
- **MODEL_OPTIONS 제거로 인한 UI 비어 있음**: 사용자가 아직 키를 등록 안 한 상태에서는 selector가 빈다. 대응: builtin fallback 카탈로그 노출 + 안내 콜아웃.
- **테마 상태 이중화**: Topbar와 사이드바 푸터가 동일 테마 메뉴를 보일 때 상태가 어긋날 위험. 대응: HomePageClient가 단일 source로 `themeMode`/`changeThemeMode`를 들고 양쪽에 prop으로 내려준다.
- **PATCH 빈발**: 메시지 전송마다 model 일치 확인 후 PATCH. selectedModelId가 chat.model과 같으면 PATCH 생략 — diff guard 필수.

## 후속 작업 (이 PR 밖)

- `config/model-policy.json`의 builtin 카탈로그 갱신(`claude-opus-4-7`, `gpt-5.5`, `gemini-3-pro` 등 실제 출시판 정렬).
- Settings에 SSH/계정 등 sub-nav 분리.
- 모바일 BottomNav 5번째 자리 검토(설정 가시화 필요 시).
