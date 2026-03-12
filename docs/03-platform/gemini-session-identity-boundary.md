# Gemini Session Identity Boundary

**Generated**: 2026-03-13

## Purpose

Gemini integration에서도 provider identity와 local correlation key를 섞지 않기 위한 경계를 명시한다. Claude alignment 과정에서 synthetic or local id가 provider session identity로 승격되며 bug가 반복됐기 때문에, Gemini는 구현 초반부터 같은 실수를 막는다.

## Rules

- Gemini provider identity는 Gemini CLI가 실제로 관측한 resume or thread identity만 사용한다.
- local correlation key는 ARIS 내부 run, append ordering, permission wait 추적용으로만 사용한다.
- local correlation key를 Gemini CLI `--resume` 값으로 주입하지 않는다.
- `resumeTarget.mode === 'resume'` 인 경우에만 Gemini CLI `--resume`을 허용한다.
- fresh turn은 provider-supplied identity가 없더라도 local correlation으로만 시작할 수 있어야 한다.
- observed provider identity가 나중에 발견되면 실패 turn에서도 보존한다.
- 상위 레이어는 Gemini raw payload key 이름을 직접 알지 않고 canonical session identity만 다룬다.

## Operational Consequences

- `geminiLauncher`는 `session-id` 성격의 target을 무시해야 한다.
- 향후 `geminiSessionSource`가 도입되더라도 synthetic or local id는 provider identity field로 저장하지 않는다.
- `happyClient`와 provider runtime은 `threadIdSource` or `source` metadata로만 recovery 근거를 설명한다.
- protocol mapper and conformance fixture는 identity key variation을 adapter 내부에서만 흡수해야 한다.

## Required Tests

- non-resume target은 Gemini CLI `--resume`으로 변환되지 않는다.
- stored resume target은 Gemini CLI `--resume`으로 전달된다.
- raw payload key variation이 있어도 canonical session identity extraction 결과는 동일하다.
- failure or timeout turn에서도 이미 observed 된 provider identity는 유지된다.
