# Session UI Legacy Archive

This folder keeps session-screen UI code that is no longer mounted by the
current chat/workspace shell but is still useful as migration reference.

The active workspace surface lives under `workspace-panels/` and may still
reuse shared helpers, hooks, and styles from `customization-sidebar/`.
Only move code here after confirming it is not imported by active routes,
tests, or shared panel components.
