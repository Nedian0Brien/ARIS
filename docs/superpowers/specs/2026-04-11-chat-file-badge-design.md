# 채팅 파일 배지 렌더링 설계

## 목표

채팅 버블 안에서 로컬 파일 참조가 브라우저 하이퍼링크로 렌더링되어 `https://.../home/ubuntu/...` 404로 이어지는 문제를 제거한다. 로컬 파일 참조는 파일 배지로 렌더링하고, 클릭 시 기존 워크스페이스 파일 열기 흐름으로 연결한다. 마크다운 파일은 기존 `WorkspaceFileEditor`의 preview 모드를 그대로 활용한다.

## 범위

- 마크다운 링크 형태의 로컬 파일 참조를 파일 배지로 렌더링한다.
- 평문으로 노출된 로컬 파일 경로도 파일 배지로 치환한다.
- 절대 경로, 상대 경로, worktree 기반 경로를 현재 워크스페이스 기준으로 정규화한다.
- `:12` 같은 라인 번호 suffix와 `(<...>)` angle-bracket 링크를 인식하되, 1차 구현에서는 파일 열기까지만 지원한다.

## 설계

### 1. 로컬 파일 참조 인식 강화

`ChatInterface.tsx`의 커스텀 마크다운/텍스트 렌더링 경로에서 링크와 평문 경로를 별도로 인식한다.

- `[label](/abs/path/file.md:12)` 같은 로컬 링크는 일반 `<a>` 대신 `ResourceChip`으로 렌더링한다.
- `[label](</abs/path with spaces/file.md:3>)` 같은 angle-bracket 경로도 지원한다.
- `/home/ubuntu/project/ARIS/docs/file.md:1`, `services/aris-web/app/page.tsx:24` 같은 평문 경로도 탐지해 인라인 파일 배지로 바꾼다.
- 외부 URL만 기존 `<a target="_blank">` 동작을 유지한다.

### 2. 경로 정규화 및 클릭 처리

배지 클릭은 항상 `dispatchWorkspaceFileOpen()`을 사용한다.

- 절대 경로와 상대 경로를 현재 워크스페이스 루트 기준으로 정규화한다.
- worktree sibling 경로는 기존 이벤트 리스너의 재매핑 흐름을 유지한다.
- `:line` suffix는 분리해서 무시하고 실제 파일 경로만 전달한다.

### 3. 편집기 연동

파일 배지 클릭은 기존 `CustomizationSidebar`의 `requestedFile -> openFileModal()` 흐름으로 연결한다.

- `.md`는 기존처럼 자동 preview 모드로 열린다.
- 일반 코드 파일은 편집 모드로 열린다.
- 읽을 수 없는 파일은 기존 파일 로드 에러 UI를 재사용한다.

## 테스트 전략

- 마크다운 링크의 절대 경로 + 라인 번호가 로컬 파일 배지로 분류되는지 테스트한다.
- angle-bracket 경로가 로컬 파일 배지로 분류되는지 테스트한다.
- 평문 상대 경로가 인라인 파일 배지로 렌더링되는지 테스트한다.
- 외부 URL은 기존 링크로 유지되는지 테스트한다.
