# Gemini Happy Alignment E2E Matrix

**Generated**: 2026-03-13

## Automated

- observed Gemini thread id가 첫 turn 이후 persisted message meta에 남는다
- 다음 turn이 같은 chat scope에서 `--resume <observed-thread-id>`를 사용한다
- tool projection과 final text projection이 queue 순서대로 저장된다
- final text message에 `geminiSessionId`와 `threadIdSource` meta가 남는다
- turn 종료 후 `isSessionRunning()`이 false로 돌아온다

## Manual

- 실제 Gemini CLI에서 long-running turn이 2분을 넘겨도 timeout budget 안에서 유지되는지 확인
- abort 직후 다음 turn이 같은 observed thread를 재사용하는지 확인
- partial-init or failure trace에서 observed identity가 사라지지 않는지 확인
- 실제 운영 trace에 permission or confirmation event가 있는지 재확인
