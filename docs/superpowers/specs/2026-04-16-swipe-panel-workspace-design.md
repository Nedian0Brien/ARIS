# Swipe Panel Workspace Design

Date: 2026-04-16
Status: Approved in chat, pending implementation plan

## Goal

Replace the current "chat + right sidebar" mental model with a horizontally swipeable workspace where the session chat is the first page and each additional page is a user-created panel.

The first implementation target is:

- real interactive `Preview` panel
- placeholder `Explorer` panel
- placeholder `Terminal` panel
- placeholder `Bookmark` panel

The experience should feel like swiping across mobile home screens or workspace pages, not opening and closing a docked sidebar.

## Approved Decisions

Approved in chat:

- chat is always page 0
- the workspace is a horizontal pager, not a right rail
- swiping right from chat moves into panel pages
- if the next slot has no panel yet, show a `Create Panel` page
- `Create Panel` offers `Preview`, `Explorer`, `Terminal`, and `Bookmark`
- desktop and mobile share the same full-page pager model
- multiple panels of the same type are allowed
- panel deletion is included in v1
- panel reordering is deferred
- preview uses an isolated preview origin/gateway instead of ARIS same-origin embedding
- panel state is stored per session/workspace

## Product Shape

### Page Sequence

Each workspace/session renders a horizontal sequence:

1. `Chat`
2. `Panel 1`
3. `Panel 2`
4. `...`
5. `Create Panel`

Rules:

- `Chat` always exists and cannot be removed
- each saved panel occupies exactly one page
- `Create Panel` is a derived page, not a persisted panel record
- when there are no panels, the workspace sequence is `Chat -> Create Panel`
- when a panel is created, the user is navigated directly into the new panel page

### Navigation Model

Primary navigation:

- touch swipe on mobile/tablet
- trackpad horizontal gesture on desktop when supported
- explicit next/previous controls for keyboard and mouse users
- page dots or compact page chips for positional awareness

The mental model is:

- `Chat` is the anchor page
- every rightward page is a workspace tool surface
- users move laterally between work surfaces instead of opening transient drawers

## Why Not Reuse The Current Right Sidebar

The current `CustomizationSidebar` model is a docked/overlay tool surface attached to the right edge of chat.

This design intentionally does not extend that pattern because:

- the requested UX is page-based, not sidebar-based
- a full interactive preview needs more width than a narrow side rail
- future tool surfaces like terminal or explorer also fit better as full pages
- the same pager model can scale across mobile and desktop without maintaining two mental models

The existing right sidebar can remain in the codebase as legacy functionality during migration, but it is not the foundation for the new panel workspace.

## UX Flow

### Empty Workspace

When a session has no saved panels:

1. user lands on `Chat`
2. swipes right once
3. sees `Create Panel`
4. chooses a panel type
5. new panel is created and shown immediately

### Existing Workspace

When a session already has panels:

1. user lands on the previously active page if available
2. swiping left/right moves between chat and saved panels
3. the final page is always `Create Panel`
4. creating a panel inserts it before the derived `Create Panel` page

### Create Panel Page

`Create Panel` is a tile-based page with four creation cards:

- `Preview`
- `Explorer`
- `Terminal`
- `Bookmark`

Each card includes:

- icon
- title
- short description
- capability state (`ready` for preview, `coming soon` for placeholders)

Tapping a card:

- creates a new panel instance
- persists it to session layout
- routes the pager to that new page

## Panel Types

### Preview

This is the only fully implemented panel in v1.

Responsibilities:

- display an interactive frontend dev server page
- support HTTP + WebSocket proxying for HMR/live updates
- show connection state, target port, and refresh actions
- allow multiple preview panels pointing at different ports or paths

Suggested v1 panel config:

- `port`
- `path`
- `title`
- optional `deviceMode` placeholder for future use

### Explorer

Placeholder page only in v1.

Future intent:

- file tree
- markdown/doc browsing
- file quick-open actions

Suggested placeholder behavior:

- static card explaining future explorer capabilities
- no file mutation or browsing in v1

### Terminal

Placeholder page only in v1.

Future intent:

- embedded session shell
- command presets
- command result log

Suggested placeholder behavior:

- static card explaining future terminal capabilities
- no PTY session in v1

### Bookmark

Placeholder page only in v1, but its data model should already anticipate executable and document shortcuts.

Future bookmark targets:

- executable scripts
- markdown documents

Suggested future bookmark entry shape:

- `id`
- `kind: "script" | "doc"`
- `label`
- `path`
- optional `description`
- optional `runCommand`

Suggested placeholder behavior:

- static card describing supported future bookmark types
- no add/run/open flows in v1

## Layout And Interaction

### Shared Pager Container

The session view should introduce a dedicated horizontal pager shell:

- full-height page track
- CSS scroll snap or controlled transform-based paging
- one page per viewport width
- hidden overflow on the x-axis
- stable vertical sizing so composer and content do not jump during page transitions

Each page must set `min-width: 0`, `width: 100%`, and `max-width: 100%` along the page chain to avoid mobile overflow regressions.

### Chat Page

The chat page remains the existing primary chat surface, but it now lives inside the pager as page 0 instead of being the permanent center panel.

The current chat behavior should be preserved:

- timeline
- composer
- chat list access
- current session/chat routing

### Panel Page Frame

Every non-chat page uses a common panel frame:

- header with panel title and type badge
- page actions such as delete and refresh when applicable
- body region for panel content

This creates a consistent shell even while most panel types are placeholders.

### Desktop Behavior

Desktop still uses the same pager structure as mobile.

Desktop additions:

- arrow buttons
- keyboard shortcuts for previous/next page
- visible page chips or dots

Desktop should not fall back to a different docked layout because that would split the product into two UX models.

## Architecture

### Frontend Structure

Suggested new pieces:

- `WorkspacePager`
- `WorkspacePageShell`
- `CreatePanelPage`
- `PanelPageRenderer`
- `PreviewPanelPage`
- `PlaceholderPanelPage`
- `useWorkspacePanels`
- `useWorkspacePager`

Suggested responsibility split:

- `WorkspacePager`: owns horizontal navigation and page rendering
- `useWorkspacePager`: active page index, gesture transitions, keyboard navigation
- `useWorkspacePanels`: fetch, mutate, and persist per-session panel layout
- `PanelPageRenderer`: selects panel implementation by `type`
- `PreviewPanelPage`: concrete preview UI and runtime state

### Data Boundary

The chat page remains driven by existing chat/session APIs.

Panel layout becomes a separate session-scoped state source:

- panel creation
- deletion
- active page restoration
- panel config updates

This avoids coupling chat timeline fetches to panel layout persistence.

## Persistence Model

Use session/workspace-scoped persistence rather than global user preferences.

Recommended approach:

- extend the existing `Workspace` metadata record with a JSON field such as `panelLayoutJson`

Suggested stored document:

```json
{
  "version": 1,
  "activePage": {
    "kind": "panel",
    "panelId": "panel_preview_a"
  },
  "panels": [
    {
      "id": "panel_preview_a",
      "type": "preview",
      "title": "Web Preview",
      "config": {
        "port": 3305,
        "path": "/"
      },
      "createdAt": "2026-04-16T10:00:00.000Z"
    }
  ]
}
```

Rules:

- `Create Panel` is not stored
- page order equals array order
- `activePage` restores the most recent panel or chat page
- deletion removes the panel and re-normalizes active page

## API Shape

Recommended new API surface:

- `GET /api/runtime/sessions/:sessionId/panels`
- `POST /api/runtime/sessions/:sessionId/panels`
- `PATCH /api/runtime/sessions/:sessionId/panels/:panelId`
- `DELETE /api/runtime/sessions/:sessionId/panels/:panelId`

Suggested behavior:

- `GET`: returns normalized layout, defaulting to empty list
- `POST`: creates one panel instance from a requested type
- `PATCH`: updates config/title/last-active metadata
- `DELETE`: removes a panel by id

Keep panel persistence separate from the existing workspace alias/pin metadata route to avoid mixing unrelated concerns in one payload contract.

## Preview Transport Design

### Why Isolation Is Required

The preview must be interactive, which means it must load the actual frontend dev server rather than a screenshot.

ARIS same-origin embedding is rejected because it creates avoidable risk:

- preview code may gain access to `window.parent`
- same-origin storage and cookies become harder to isolate
- dev servers with root-relative assets and HMR sockets are brittle under path-prefix proxy hacks

### Chosen Direction

The preview panel will embed an iframe that points to an isolated preview gateway origin.

Conceptually:

- ARIS app renders the panel shell
- iframe points to preview gateway URL
- preview gateway validates user/session access
- preview gateway proxies HTTP and WebSocket traffic to approved local ports

### Preview Gateway Requirements

The gateway must:

- only allow loopback/local targets such as `127.0.0.1` and `localhost`
- only allow configured ports from an allowlist
- proxy WebSocket upgrades for HMR
- avoid leaking ARIS auth cookies to the target dev server
- expose clear connection errors for unreachable targets

Suggested allowlist source:

- environment variable, for example `ARIS_PREVIEW_ALLOWED_PORTS`

Suggested initial allowed ports:

- `3000`
- `3005`
- `5173`
- `8080`

### Preview Panel States

Minimum v1 states:

- `idle`
- `connecting`
- `ready`
- `unreachable`
- `forbidden_port`
- `proxy_error`
- `reconnecting`

The panel header should surface these states clearly.

## Accessibility And Input

The pager must not rely on swipe alone.

Required alternatives:

- visible previous/next controls
- keyboard navigation support
- focus management when page changes
- page titles announced for assistive tech where practical

The create-panel tiles should be keyboard reachable and clearly labeled as creation actions.

## Migration Strategy

1. Introduce panel data model and session-scoped panel APIs
2. Build the pager shell around the existing chat page
3. Add the derived `Create Panel` page
4. Implement panel create/delete flows
5. Implement real `Preview` panel using isolated preview gateway
6. Add placeholder `Explorer`, `Terminal`, and `Bookmark` pages
7. Restore active page from persisted layout
8. Leave legacy sidebar tools separate during rollout

## Testing Requirements

Minimum required verification:

- unit tests for panel layout normalization and active-page restoration
- API tests for create/update/delete panel persistence
- preview gateway tests covering loopback-only host validation and allowed-port enforcement
- preview gateway tests covering WebSocket proxying
- pager interaction tests for swipe and button-based page changes
- mobile regression tests:
  - `services/aris-web/tests/mobileOverflowLayout.test.ts`
  - `services/aris-web/tests/e2e/mobile-overflow.spec.ts`

Recommended E2E scenarios:

- empty session: `Chat -> Create Panel -> create Preview -> Preview page`
- multi-panel session: chat and two panels restore in correct order
- delete active panel: focus lands on a valid neighboring page
- preview panel connected to a local dev server and receiving live updates

## Risks

Primary risks:

- implementing the pager without preserving chat stability
- preview gateway security gaps exposing unintended internal services
- WebSocket/HMR incompatibilities across different dev servers
- mobile horizontal overflow caused by nested flex/grid page containers

Mitigations:

- keep chat page rendering isolated from panel state
- enforce strict host and port validation in the gateway
- start with a narrow port allowlist
- test root-relative asset loading and HMR explicitly
- apply width guards (`min-width: 0`, `max-width: 100%`) through the full pager chain

## Non-Goals For V1

Explicitly deferred:

- panel reordering
- fully functional explorer panel
- fully functional terminal panel
- fully functional bookmark panel
- drag-and-drop workspace composition
- multi-column simultaneous panel display
- viewer-role interactive preview

## Implementation Readiness

This design is ready for implementation planning with the following scope boundary:

- deliver the horizontal pager workspace
- deliver create/delete panel flows
- persist panel layout per session
- fully implement preview panel transport and UI
- ship placeholder pages for explorer, terminal, and bookmark
