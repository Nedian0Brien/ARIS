Imported Chat History QA

Design read:
- Surface: existing project chat timeline, operator-focused dense tool UI.
- Token source: services/aris-web/app/styles/ui.css.
- Added UI uses existing spacing, surface, text, border, radius, and text-size variables only.

Behavior checked:
- Imported chat title is shown from the first real user request, not the generic imported-chat fallback.
- The selected production chat has all 18 parser-visible Codex messages already imported, so the older-history button is correctly absent for this chat.
- Unit and route-level tests cover the button path for sessions that still have older parser-visible messages.

Browser QA:
- 390x844: title visible, no false older-history button, no horizontal overflow.
- 768x1024: title visible, no false older-history button, no horizontal overflow.
- 1280x900: title visible, no false older-history button, no horizontal overflow.

Artifacts:
- browser-result.json
- imported-chat-390.png
- imported-chat-768.png
- imported-chat-1280.png
