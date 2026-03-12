# Claude Happy Alignment E2E Matrix

## 목적

Happy backend alignment 이후 Claude runtime이 실제 운영 흐름에서 깨지지 않는지 검증하기 위한 E2E 기준선이다.

## 자동 검증 범위

| Case | 경로 | 기대 결과 | 자동화 상태 |
| --- | --- | --- | --- |
| 신규 세션 + remote launch | `/workspace/*` path + host mapping | `launchMode=remote`, 세션 생성 후 Claude turn 시작 | 완료 |
| permission 대기/승인 | provider permission facade | pending permission 생성 후 승인 시 turn 재개 | 완료 |
| tool action + text ordering | Claude ordered queue | tool 메시지가 text 메시지보다 먼저 저장 | 완료 |
| observed session id 반영 | Claude provider flow | synthetic bootstrap 이후 observed thread id로 정렬 | 기존 자동화 유지 |

## 수동 검증 범위

| Case | 절차 | 기대 결과 |
| --- | --- | --- |
| resume multi-turn | 같은 채팅에서 2회 이상 Claude turn 전송 | 이전 Claude session id를 재사용하고 continuity 유지 |
| abort during permission wait | permission pending 상태에서 abort 액션 | running 상태가 해제되고 추가 tool/text append 중단 |
| deny permission | pending permission에 `deny` 결정 | turn이 중단되고 오류 또는 중단 상태가 일관되게 반영 |
| file read/write mix | 읽기 후 patch/write 연속 실행 | tool card 순서와 diff 메타가 일관되게 저장 |

## 실행 명령

```bash
cd services/aris-backend
npm test -- happyAlignment.e2e.test.ts
```

## 비고

- 실제 Claude CLI 인증 상태나 upstream availability는 이 매트릭스의 자동 테스트 범위 밖이다.
- 운영 smoke test는 main 병합 이후 별도 단계에서 수행한다.
