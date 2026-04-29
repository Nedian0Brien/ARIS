# ARIS Design System

## 1. Design thesis

ARIS should feel like a premium execution console for agentic software work.
The target is not a generic chat app, IDE clone, or dashboard template. It is a
high-trust product surface where conversation, runtime state, files, panels,
permissions, previews, and delivery evidence all feel like one precise machine.

The new aesthetic direction is **Graphite Command Surface**:

- Linear-tier clarity, density, and restraint, without copying Linear directly.
- Dark graphite as the primary stage, with restrained luminous accents.
- Thin hairlines, nested surfaces, and machined double-bezel cards.
- Motion that feels fast, physical, and deliberate.
- Agent activity visualized as structured operational evidence, not noisy chat.
- Panel-native workspaces, not transplanted sidebars.

This system intentionally replaces the current light SaaS/dashboard feeling with
a more premium, focused, command-center identity.

## 2. Product personality

### ARIS should feel

- **Precise**: every boundary, label, state, and transition has a job.
- **Calm under load**: long chats, running tools, failures, and approvals remain readable.
- **Fast**: interactions feel immediate, but not twitchy.
- **Technical without being raw**: code, logs, and runtime status are first-class surfaces.
- **Expensive**: fewer decorative elements, better spacing, sharper hierarchy.

### ARIS should not feel

- Like a default ChatGPT skin.
- Like a Bootstrap admin panel.
- Like an IDE sidebar pasted into a chat app.
- Like a pastel AI dashboard.
- Like a collection of unrelated cards.

## 3. Visual language

### Core metaphor

ARIS is a **dark machined workbench** with illuminated instrument surfaces.
The user is not browsing content; they are operating a system.

Use three layers:

- **Field**: the dark graphite application background.
- **Instrument**: durable panels, chat streams, file surfaces, preview frames.
- **Signal**: state color, command activity, agent identity, errors, permissions.

### Shape language

- Large shell radius: `28px` to `36px`.
- Card radius: `20px` to `28px`.
- Control radius: `12px` to `16px`.
- Pills: `999px`.
- Avoid generic `8px` SaaS cards for major surfaces.
- Major surfaces should use nested bezels: outer tray plus inner core.

### Texture language

- Use graphite gradients and very subtle noise, not flat black.
- Use hairline borders with alpha, not visible gray boxes.
- Use inset highlights to make surfaces feel machined.
- Use glow only for state emphasis, never as decoration everywhere.
- Avoid large blurred glass panes on scroll containers for performance.

## 4. Token proposal

The current implementation already has CSS variables in
`services/aris-web/app/styles/tokens.css`. The redesign should introduce a
second-generation token layer rather than hardcoding one-off colors in modules.

Recommended token namespace: `--ds-*` for system primitives and `--aris-*` for
product semantics.

```css
:root {
  color-scheme: dark;

  /* Background field */
  --ds-bg-canvas: #06080d;
  --ds-bg-canvas-raised: #090d14;
  --ds-bg-noise-opacity: 0.035;

  /* Surfaces */
  --ds-surface-1: #0d111a;
  --ds-surface-2: #111722;
  --ds-surface-3: #171f2d;
  --ds-surface-inset: #070a10;
  --ds-surface-floating: rgba(17, 23, 34, 0.82);

  /* Hairlines */
  --ds-line-soft: rgba(255, 255, 255, 0.07);
  --ds-line: rgba(255, 255, 255, 0.105);
  --ds-line-strong: rgba(255, 255, 255, 0.16);
  --ds-line-accent: rgba(132, 204, 255, 0.34);

  /* Text */
  --ds-text: #eef3fb;
  --ds-text-muted: #9ba8ba;
  --ds-text-subtle: #69758a;
  --ds-text-disabled: #4e596b;
  --ds-text-on-accent: #041019;

  /* Accents */
  --ds-accent-primary: #8bd3ff;
  --ds-accent-primary-strong: #4fb7ff;
  --ds-accent-violet: #a78bfa;
  --ds-accent-amber: #f2c56b;
  --ds-accent-emerald: #67e8b9;
  --ds-accent-red: #ff7b87;
  --ds-accent-slate: #9aa8bd;

  /* Semantic state fills */
  --ds-state-running-bg: rgba(79, 183, 255, 0.13);
  --ds-state-running-line: rgba(79, 183, 255, 0.32);
  --ds-state-waiting-bg: rgba(242, 197, 107, 0.13);
  --ds-state-waiting-line: rgba(242, 197, 107, 0.34);
  --ds-state-success-bg: rgba(103, 232, 185, 0.12);
  --ds-state-success-line: rgba(103, 232, 185, 0.3);
  --ds-state-danger-bg: rgba(255, 123, 135, 0.13);
  --ds-state-danger-line: rgba(255, 123, 135, 0.32);

  /* Geometry */
  --ds-radius-xs: 10px;
  --ds-radius-sm: 14px;
  --ds-radius-md: 20px;
  --ds-radius-lg: 28px;
  --ds-radius-xl: 36px;
  --ds-radius-full: 999px;

  /* Spacing */
  --ds-space-1: 4px;
  --ds-space-2: 8px;
  --ds-space-3: 12px;
  --ds-space-4: 16px;
  --ds-space-5: 20px;
  --ds-space-6: 24px;
  --ds-space-8: 32px;
  --ds-space-10: 40px;
  --ds-space-12: 48px;
  --ds-space-16: 64px;

  /* Elevation */
  --ds-shadow-panel:
    0 24px 80px rgba(0, 0, 0, 0.42),
    0 1px 0 rgba(255, 255, 255, 0.04) inset;
  --ds-shadow-floating:
    0 18px 48px rgba(0, 0, 0, 0.36),
    0 0 0 1px rgba(255, 255, 255, 0.08);
  --ds-shadow-active:
    0 0 0 1px rgba(139, 211, 255, 0.38),
    0 18px 44px rgba(79, 183, 255, 0.14);

  /* Motion */
  --ds-ease-standard: cubic-bezier(0.22, 1, 0.36, 1);
  --ds-ease-snap: cubic-bezier(0.32, 0.72, 0, 1);
  --ds-ease-exit: cubic-bezier(0.7, 0, 0.84, 0);
  --ds-duration-fast: 140ms;
  --ds-duration-standard: 260ms;
  --ds-duration-slow: 520ms;

  /* Typography */
  --ds-font-sans: "Geist", "Pretendard Variable", "Noto Sans KR", system-ui, sans-serif;
  --ds-font-display: "Geist", "Pretendard Variable", "Noto Sans KR", system-ui, sans-serif;
  --ds-font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
}
```

## 5. Typography

### Font direction

Use a precise grotesk family rather than a default app stack.

- Primary: `Geist` or `Pretendard Variable`.
- Mono: `Geist Mono` or `JetBrains Mono`.
- Avoid making `Inter`, `Roboto`, `Arial`, or default system fonts the visual identity.
- Korean text should remain crisp at small sizes; do not over-condense Korean labels.

### Type scale

```css
:root {
  --ds-type-display: clamp(2.4rem, 5vw, 5.6rem);
  --ds-type-title-xl: clamp(1.8rem, 2.4vw, 2.8rem);
  --ds-type-title-lg: 1.35rem;
  --ds-type-title-md: 1.05rem;
  --ds-type-body: 0.94rem;
  --ds-type-body-sm: 0.84rem;
  --ds-type-caption: 0.74rem;
  --ds-type-micro: 0.66rem;

  --ds-leading-tight: 1.08;
  --ds-leading-title: 1.18;
  --ds-leading-body: 1.58;
  --ds-tracking-label: 0.13em;
}
```

### Typography rules

- Page titles should be calm and compact, not hero-marketing huge inside product flows.
- Runtime labels use uppercase micro text with wider tracking.
- Chat content uses body scale, not tiny dashboard text.
- Code and paths use mono, but file paths must wrap safely.
- Avoid all-caps Korean except short technical labels.

## 6. Color semantics

Use color as an operational signal.

| Meaning | Color | Use |
| --- | --- | --- |
| Primary action / active route | Electric sky | Send, active session, current panel |
| Running / streaming | Sky | Active agent run, live tool execution |
| Waiting / approval | Amber | Permission request, queued action |
| Success / write complete | Emerald | Completed action, saved file, deployed state |
| Code / model intelligence | Violet | Model selection, reasoning, structured insight |
| Error / destructive | Red | Failure, abort, delete, revoked auth |
| Passive metadata | Slate | timestamps, secondary labels, neutral badges |

Rules:

- Never rely on color alone. Pair it with labels, icons, or text.
- Do not use saturated fills for large panels.
- Keep fills around 10-16% opacity and use the line/ring for emphasis.
- Reserve full accent backgrounds for primary controls and rare active states.

## 7. Layout system

### Desktop shell

Desktop ARIS should read as a focused command environment:

- Left session rail: compact navigation and session switching.
- Center conversation stage: main execution timeline and composer.
- Right workspace area: panel-native tools, previews, files, git, context.

Recommended proportions:

- Session rail: `264px` collapsed/standard, `304px` expanded.
- Conversation minimum: `minmax(480px, 1fr)`.
- Workspace panel: `minmax(420px, 0.9fr)` when visible.
- Gaps: `16px` shell gap, `12px` inner panel gap.
- Shell padding: `16px` desktop, `12px` tablet, `8px` mobile.

### Tablet shell

Tablet should not pretend to be desktop. Use a pager model:

- Chat and workspace become sibling pages.
- Header controls show page position and quick back/forward actions.
- Avoid permanent sidebars that reduce content below usable width.

### Mobile shell

Mobile must be single-task and overflow-safe:

- One primary page at a time.
- Composer remains reachable and keyboard-safe.
- Panels open as pages or modal sheets, not squeezed columns.
- All long labels, paths, titles, and model names must survive narrow width.

Mobile hard rules:

- Use `min-width: 0` across every flex/grid child chain.
- Use `max-width: 100%` on cards, rows, pills, and text groups.
- Use `overflow-wrap: anywhere` for paths, IDs, model names, and runtime payload snippets.
- Use `min-height: 100dvh` or the existing viewport token strategy; avoid raw `100vh`.
- Touch targets are at least `44px`.

## 8. Surface architecture

### Double-bezel shell

Major cards should use a nested shell:

```tsx
<section className="ds-shell">
  <div className="ds-shellCore">
    {children}
  </div>
</section>
```

```css
.ds-shell {
  border-radius: var(--ds-radius-xl);
  padding: 1px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.04)),
    rgba(255,255,255,0.035);
  box-shadow: var(--ds-shadow-panel);
}

.ds-shellCore {
  border-radius: calc(var(--ds-radius-xl) - 1px);
  background:
    radial-gradient(circle at 20% 0%, rgba(139, 211, 255, 0.08), transparent 34%),
    linear-gradient(180deg, var(--ds-surface-2), var(--ds-surface-1));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.055);
}
```

Use this for:

- Chat center pane.
- Workspace panel surface.
- Permission strip.
- Runtime event cards.
- Preview frame.
- Settings cards.
- Session detail cards.

Do not use this for:

- Tiny chips.
- Inline text rows.
- Every single nested item, or the UI becomes heavy.

## 9. Components

### App frame

Purpose: owns the graphite field, global nav, and responsive shell.

Rules:

- Background uses layered radial gradients on `body` or app root.
- Noise overlay is fixed, pointer-events-none, and extremely subtle.
- No edge-to-edge sticky white nav.
- Global header, if visible, should be a floating instrument strip.

### Session rail

Purpose: fast orientation and switching.

Anatomy:

- Workspace/account identity block.
- New session command.
- Session groups.
- Running status indicators.
- Compact metadata row.

Rules:

- Active session gets line/ring emphasis, not a giant filled card.
- Running sessions show a small pulsing signal dot and status label.
- Session titles clamp to two lines on desktop and one line in dense rails.
- Status must be readable without relying on dot color.

### Chat timeline

Purpose: make execution history legible.

Message categories:

- User instruction.
- Agent reasoning/text.
- Tool execution.
- File read.
- File write.
- Permission request.
- System/runtime transition.

Rules:

- Treat tool events as structured evidence cards, not chat bubbles.
- User messages can be compact command capsules.
- Agent messages should prioritize text readability over decoration.
- Long code/log blocks live inside inset mono surfaces.
- File write cards should show changed path, action, and confidence/state.

### Composer

Purpose: the command input for the whole system.

Anatomy:

- Text input.
- Mode selector.
- Attachment/context chips.
- Model/provider selector.
- Primary send control.
- Secondary controls: stop, retry, compact, resume.

Rules:

- Composer should feel like an instrument panel, not a plain textarea.
- Primary send button uses nested button-in-button architecture.
- On mobile, composer must not cause horizontal overflow.
- Focus state should glow subtly with sky accent.
- Do not hide critical run controls behind ambiguous icons.

### Workspace panel shell

Purpose: panel-native work, not sidebar transplantation.

Required modes:

- Files.
- Git.
- Context.
- Preview.
- Create panel.

Rules:

- Each mode has local navigation and local detail.
- Desktop may use split panes inside the panel.
- Mobile uses a page stack or modal detail sheet.
- Keep panel header persistent across chat/workspace transitions.
- File editors and previews get stronger inset surfaces than generic cards.

### Permission strip

Purpose: resolve execution blockers quickly.

Rules:

- Amber state, but with a premium dark surface.
- Show command/request summary, risk level, and action choices.
- `Allow once`, `Allow session`, and `Deny` must be visually distinct.
- Dangerous approvals use red line/ring, not a full red panel.

### Runtime status card

Purpose: explain what the agent is doing right now.

States:

- Connecting.
- Running.
- Waiting for approval.
- Streaming.
- Restarted.
- Completed.
- Failed.
- Aborted.

Rules:

- Use concise labels.
- Include timestamp or duration where useful.
- Use motion only for live states.
- Completed states should become quiet quickly.

### Preview frame

Purpose: make local app previews feel native to ARIS.

Rules:

- Preview uses a strong machined frame.
- URL/status controls live in the frame header.
- Iframe body should not get blur or decorative overlays.
- Loading/error states should be explicit and visually calm.

### Settings and catalog cards

Purpose: configure high-impact system behavior.

Rules:

- Group settings by operational consequence, not by implementation detail.
- Model/provider cards can use violet/sky accents sparingly.
- Custom model IDs and API keys must wrap safely.
- Destructive actions require clear copy and red semantic treatment.

## 10. Motion system

Motion should make ARIS feel alive but never theatrical during work.

### Durations

- Hover and focus: `140ms`.
- Panel/page transition: `260ms`.
- Sheet/modal enter: `360ms`.
- First-load staged reveal: `520ms`.

### Easing

Use:

- `var(--ds-ease-standard)` for normal transitions.
- `var(--ds-ease-snap)` for panels, command menus, and active page shifts.
- `var(--ds-ease-exit)` for dismissals.

Avoid:

- `linear`.
- Generic `ease-in-out`.
- Animating width/height/top/left.

### Motion patterns

- Active item: slight lift plus ring interpolation.
- Panel enter: `opacity` + `translateY(8px)` or `translateX(10px)`.
- Modal/sheet: scale from `0.985` to `1`, opacity fade.
- Running status: low-frequency pulse on a small signal dot only.
- Composer focus: ring and inner glow, no layout shift.

Performance rules:

- Animate only `transform` and `opacity`.
- Use `backdrop-filter` only on fixed/sticky overlays or small floating controls.
- Do not blur scrolling containers.
- Respect `prefers-reduced-motion`.

## 11. Accessibility

Minimum rules:

- WCAG AA contrast for all text.
- Focus states visible on keyboard navigation.
- Touch targets at least `44px`.
- Status color always has text/icon redundancy.
- Buttons have clear labels, not icon-only mystery actions.
- Destructive controls require copy that states the consequence.
- Code/log regions should preserve keyboard selection and scrolling.

Contrast targets:

- Body text on surface: `7:1` preferred, `4.5:1` minimum.
- Muted text on surface: `4.5:1` where it communicates important content.
- UI boundary or icon contrast: `3:1` minimum.

## 12. Content style

ARIS copy should be short, technical, and calm.

Use:

- "Running"
- "Waiting for approval"
- "Changed 3 files"
- "Preview unavailable"
- "Resume session"
- "Allow once"

Avoid:

- "Oops!"
- "Something magical is happening"
- "Your AI assistant is thinking"
- "Supercharged productivity"
- Long helper paragraphs inside dense work surfaces.

## 13. Implementation migration plan

### Phase 1: foundation

- Add second-generation design tokens beside the current token file.
- Introduce `ds-*` utility classes for shell, card, chip, button, field, and mono inset.
- Keep existing behavior unchanged.
- Add a visual reference page or Storybook-style local route if desired.

### Phase 2: chat shell

- Redesign chat shell background, center pane, sidebar rail, and composer.
- Convert message/event cards to the new structured evidence model.
- Preserve current runtime behavior and scroll ownership rules.
- Run mobile overflow guard after layout changes.

### Phase 3: workspace panels

- Redesign `WorkspaceShell`, `WorkspacePager`, preview, files, git, and context surfaces.
- Keep the panel-native IA.
- Ensure header chrome persists across workspace pages.
- Use split panes only where width supports it.

### Phase 4: dashboard/settings

- Rebuild session dashboard using the same graphite command surface.
- Convert settings/catalog cards to nested premium surfaces.
- Remove remaining old light-dashboard visual assumptions.

### Phase 5: refinement

- Add motion choreography.
- Add contrast audit updates for new tokens.
- Document component usage examples.
- Remove obsolete ad-hoc module variables after parity is achieved.

## 14. Quality bar

A redesigned ARIS screen is acceptable only if:

- It feels like one coherent product, not several CSS eras.
- The chat, workspace, and runtime states share one visual grammar.
- Dense technical data remains readable.
- Mobile has no horizontal overflow with long titles, file paths, model IDs, or logs.
- The interface feels premium in still screenshots and during interaction.
- The design does not compromise debugging, approvals, or operational evidence.

## 15. First target screen recommendation

Start with the **chat workspace shell**.

Reason:

- It is the core ARIS experience.
- It owns the strongest visual identity surface.
- It touches the session rail, timeline, composer, runtime state, and workspace pager.
- Once this shell works, dashboard and settings can inherit the system with less debate.

The first implementation should avoid broad feature changes. Treat it as a visual
system migration: same behavior, new shell, new tokens, stronger hierarchy, and
mobile overflow discipline from day one.
