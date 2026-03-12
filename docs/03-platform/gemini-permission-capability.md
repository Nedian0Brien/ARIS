# Gemini Permission Capability

**Generated**: 2026-03-13

## Current Decision

현재 Gemini 통합에서는 provider-level permission bridge를 활성화하지 않는다.

## Basis

- 현재 저장된 Gemini fixture에는 approval or permission event가 없다.
- `happyClient`의 Gemini 경로는 tool and text projection만 필요하며, Claude처럼 `waiting_permission` 상태를 만드는 provider 이벤트가 관측되지 않았다.
- permission capability가 확인되지 않은 상태에서 Claude 구조를 그대로 복제하면 불필요한 추상화가 생긴다.

## Consequences

- `geminiPermissionBridge.ts`는 현재 no-op로 유지한다.
- Sprint 6 범위에서는 abort and failure lifecycle을 우선 정리한다.
- 추후 실제 Gemini trace에서 approval or confirmation event가 관측되면 fixture와 bridge를 다시 확장한다.

## Revisit Trigger

- Gemini CLI raw trace에 `permission`, `approval`, `confirmation`, `wait` 성격의 이벤트가 등장할 때
- 실제 운영 환경에서 tool execution 전 사용자 승인이 필요한 흐름이 확인될 때
