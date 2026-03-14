# AGENTS (project)

## Operational Rules

- 사용자의 지침을 받으면 사용자의 의도에 대해서 이해한 내용을 반드시 먼저 작성한다.
- 작업 완료 이후 반드시 커밋, 푸쉬를 거친다.
- 작업 과정에서 식별한 이슈 중 대응이 필요한 이슈는 GitHub 리포지토리에 이슈를 작성하여 추가한다.
- GitHub 이슈를 생성할 때는 제목과 본문을 반드시 한글로 작성한다.
- main 브랜치에 머지하면 GitHub Actions에 의해 자동으로 배포가 수행된다. 머지하고 나면 배포가 성공하는지까지 확인하여 사용자에게 최종 보고한다.
- 직접 배포를 수행할 때는 반드시 deploy/README.md 문서를 참고한다.
- 머지 과정에서 충돌이 발생한 경우 어떤 내용이 서로 충돌하는지 파악한 후 사용자에게 설명하고, 처리 방안 3가지를 제안한다.
- 작업이 마무리되고 나면 후속 작업 5가지를 제안한다.
- 사용자의 지침 중 확실하지 않은 부분이 있으면 작업을 진행하기 전에 사용자에게 분명히 물어본다. 이때 사용자의 의도일 가능성이 있는 최대 3가지 경우를 제시하며 사용자에게 의도를 명확히 해 달라고 요청한다.
- 코드 변경 작업은 반드시 에이전트별 전용 `git worktree`에서 독립적으로 수행한다. 현재 워킹 디렉터리에서의 직접적인 수정 작업은 엄격히 금지된다.
- 멀티 에이전트/병렬 작업뿐만 아니라 단독 작업 시에도 전용 `git worktree` 환경을 보장해야 한다.
- 동일한 워킹 디렉터리를 여러 에이전트가 공유해서 동시에 수정하는 것을 금지한다.
- 모든 작업은 시작 전 아래 표준 절차로 전용 작업 디렉터리를 생성하고, 해당 경로에서만 커밋/푸쉬를 수행한다.
- 1) 메인 체크아웃에서 `services/aris-backend/node_modules` 와 `services/aris-web/node_modules` 가 준비되어 있는지 먼저 확인한다. 없거나 필요한 dev 바이너리(`vitest`, `tsc`)가 없으면 메인 체크아웃에서 각 서비스의 의존성을 먼저 설치한다.
- 2) 새 작업 디렉터리는 `scripts/create_worktree_with_shared_node_modules.sh <worktree_path> <branch> [base_ref]` 로 생성한다. 이 스크립트를 표준 경로로 사용하며, 내부에서 `git worktree add` 이후 공유 `node_modules` 심볼릭 링크까지 연결한다.
- 3) 이미 `git worktree add` 로 만든 작업 디렉터리라면 즉시 `scripts/link_shared_node_modules.sh <worktree_path>` 를 실행해 공유 `node_modules` 를 연결한다.
- 4) 링크 이후 필요한 바이너리가 보이지 않으면 메인 체크아웃에서 의존성을 다시 설치한 뒤 `scripts/link_shared_node_modules.sh <worktree_path>` 를 다시 실행한다.
- 5) 수정, 테스트, 커밋, 푸쉬, 머지는 모두 해당 전용 `git worktree` 내부에서만 수행한다.
- 작업 완료 후 `main` 브랜치에 머지가 완료되면, 사용했던 전용 `git worktree`를 `git worktree remove <path>`로 제거하고, 작업에 사용된 로컬 및 원격 브랜치도 함께 삭제하여 환경을 청결하게 유지한다.
- 런타임 로그 조회가 필요하면 먼저 `scripts/lookup_runtime_logs_by_id.sh <id>` 를 사용해 `SessionChat` / `SessionMessage` / 관련 ndjson 로그를 함께 조회한다. 기본은 exact match 기준이며, 세션 단위까지 넓혀야 하면 `--include-session-id` 를 추가한다.
- 로그는 주로 `logs/`, `.runtime/aris-backend/logs/`, `services/aris-backend/logs/` 경로를 우선 확인한다.
