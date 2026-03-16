# CLAUDE.md

작업 시작 전 반드시 `AGENTS.md`를 읽는다.

## 피드백
- When debugging, add debug logging/prints early rather than only reading code. Do not assume root causes from code reading alone—verify with actual runtime output.
- When user reports a bug, focus on finding the actual root cause before proposing fixes. Limit fix attempts to 2 before stepping back to add logging or re-examine assumption