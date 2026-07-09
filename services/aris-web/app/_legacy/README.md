# Legacy code quarantine

This folder contains **pre-redesign** code that is no longer the active path.

- `_legacy/sessions/[sessionId]/**` — the pre-redesign session chat surface (the URL `/sessions/[id]` no longer routes).
- The post-redesign project chat surface lives in `services/aris-web/components/project-chat/**` (rendered from `app/HomePageClient.tsx` under `/?tab=project&view=chat`).
- Next.js excludes underscore-prefixed folders from routing, so the legacy URL is automatically deactivated.

## Rules

- **Do not add new features here.**
- Some utility modules (`useProjectScrollOrchestrator`, `MarkdownContent`, `chat-screen/helpers`, etc.) are still imported by post-redesign code — leave those alone. New features should pull them out to a shared location instead of editing them in place.
- If a future refactor extracts those utilities to a shared location, the corresponding files in `_legacy/sessions/[sessionId]/` can be deleted.

See `AGENTS.md` for the broader legacy boundary policy.
