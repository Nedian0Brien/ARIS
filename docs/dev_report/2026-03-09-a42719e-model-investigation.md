# a42719e 변경 영향 조사 보고서 (2026-03-09)

## 목적
`a42719e` 커밋의 변경사항이 "메시지 전송 후 실행중 상태가 지속되고 응답이 오지 않는 현상"의 원인이 될 수 있는지 확인한다.

## 조사 대상 커밋
- 커밋: `a42719ec84787910a93070209928cb6c004a312d`
- 시각: 2026-03-09 14:06:23 (KST)
- 메시지: `feat(chat-model): support per-chat model selection across agents`

## 핵심 변경 요약
1. 채팅(`SessionChat`) 단위 모델 필드 추가
- Prisma 스키마 및 마이그레이션에 `SessionChat.model` 추가
2. 프론트엔드에서 사용자 메시지 전송 시 `meta.model` 포함
- `ChatInterface`에서 선택 모델을 이벤트 POST payload에 포함
3. 백엔드에서 `meta.model`을 실제 에이전트 실행 모델로 사용
- `happyClient.appendMessage` -> `generateAndPersistAgentReply` -> `runCodex*`
4. Codex 기본 모델 ID를 `gpt-5-codex`로 도입

## 원인 가능성 분석

### 결론
`a42719e`는 현재 증상의 **유의미한 원인 후보**다.

### 근거
1. 모델 전달 경로가 `a42719e`에서 새로 연결되었다.
- 이전에는 채팅 메시지마다 모델이 강제 전달되지 않았지만, 이후에는 매 요청마다 `meta.model`이 전달된다.

2. 잘못된/구형 모델 문자열이 실행 파라미터로 직행한다.
- 모델 값은 길이/trim만 적용되며, 실행 가능 모델인지 검증하지 않는다.
- Codex app-server/exec 모두 모델 문자열을 직접 CLI 인자로 주입한다.

3. `gpt-5-codex` 도입 직후 수정 이력이 존재한다.
- 이후 커밋 `000b43e`(2026-03-09 15:55:40 KST)에서 기본 모델을 `gpt-5.3-codex`로 수정했다.
- 이미 저장된 `SessionChat.model`은 자동 교정되지 않으므로, 구형 값이 남아 있으면 무응답/장기 대기 케이스를 유발할 수 있다.

4. 장기 대기 시 체감 증상과 일치한다.
- Codex app-server 경로는 turn completion 대기 구조이며, 특정 실패 케이스에서 완료 이벤트가 누락되면 실행중 상태가 지속될 수 있다.

## 확인이 필요한 데이터 포인트
1. 운영 DB `SessionChat.model`에 `gpt-5-codex` 값이 잔존하는지
2. 무응답 발생 시점의 런타임 로그에서 turn completion 이벤트 누락 여부

## 권장 대응
1. 데이터 보정: `SessionChat.model='gpt-5-codex'` 값을 `gpt-5.3-codex`로 일괄 교정
2. 실행 전 모델 검증/정규화: agent별 허용 모델 또는 custom model 정책 기반
3. Codex 실행 타임아웃 가드: 장기 대기 시 오류 메시지 저장 + active run 정리
4. 모델 전달/turn 완료 로그 보강

## 이슈 등록
- https://github.com/Nedian0Brien/ARIS/issues/28
