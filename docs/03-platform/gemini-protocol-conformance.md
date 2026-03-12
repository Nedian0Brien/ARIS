# Gemini Protocol Conformance

**Generated**: 2026-03-13

## Purpose

Gemini raw stream-json payload를 상위 레이어가 직접 해석하지 않도록, adapter가 canonical session protocol envelope로 정규화하는 기준을 고정한다.

## Invariants

- raw key casing or naming variation은 `geminiProtocolFields.ts` 내부에서만 흡수한다.
- `turn-start`, `tool-call-start`, `tool-call-end`, `text`, `turn-end`, `stop`는 canonical envelope만 상위에 노출한다.
- transcript-only result는 final assistant text로 승격하지 않는다.
- observed session or thread identity는 init, result, stop trace 어디에서 나오든 같은 canonical session id로 해석된다.

## Fixture Set

- `init-lowercase-sessionid.jsonl`
  - lowercase `sessionid`를 init payload에서 파싱하는 기준선
- `tool-and-final.jsonl`
  - tool event, result text, completed stop envelope를 동시에 검증하는 기준선
- `stop-timeout-with-threadid.jsonl`
  - timeout stop reason과 observed thread identity 유지 기준선
- `actual-simple-success.jsonl`
  - 실제 Gemini CLI `type:init`, `type:message(role=assistant)`, `type:result(status=success)` shape 기준선
- `actual-resume-success.jsonl`
  - 실제 Gemini CLI resume trace에서도 같은 observed session identity가 유지되는지 검증하는 기준선
