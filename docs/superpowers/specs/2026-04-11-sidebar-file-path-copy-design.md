# 우측 사이드바 파일 경로 복사 기능 설계

## 목표

채팅 화면 우측 사이드바의 파일 편집기에서 파일/폴더 경로를 쉽게 복사할 수 있도록 `절대경로 복사`와 `상대경로 복사` 기능을 추가한다.

## 범위

- `CustomizationSidebar`의 파일 트리 항목 메뉴(`...`)에 아래 액션을 추가한다.
  - `절대경로 복사`
  - `상대경로 복사`
- `WorkspaceFileEditor` 헤더에 현재 열린 파일 기준 복사 액션을 추가한다.
- 상대경로 기준은 워크스페이스/프로젝트 루트(`workspaceRootPath`)로 고정한다.

## 비범위

- Git 패널 경로 복사 기능
- 드래그 앤 드롭, 다중 선택, 운영체제별 경로 포맷 변환
- 새 토스트 시스템 도입

## 현재 구조

- 파일 트리와 파일 액션 메뉴는 `services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.tsx`에서 관리한다.
- 경로 정규화 유틸(`normalizeWorkspaceClientPath`, `joinWorkspacePath`, `isWorkspacePathWithinRoot`)도 같은 파일에 존재한다.
- 파일 에디터 헤더는 `services/aris-web/components/files/WorkspaceFileEditor.tsx`에서 렌더링한다.

## 설계

### 1. 경로 계산

- 공용 helper를 추가해 다음 동작을 고정한다.
  - 절대경로: 클라이언트에 노출되는 현재 workspace 경로를 그대로 반환
  - 상대경로: `workspaceRootPath` 기준으로 계산
  - 대상 경로가 workspace root와 같으면 `.` 반환
  - 대상 경로가 root 하위면 `services/aris-web/...` 형태 반환
- 현재 UI 흐름상 파일 패널에 노출되는 경로는 root 내부 경로가 기본이므로, root 밖 경로가 들어오면 방어적으로 절대경로와 동일한 값으로 fallback 한다.

### 2. UI 배치

- 파일/폴더 행의 `...` 메뉴에 `이름 변경`, `삭제` 사이에 경로 복사 액션 2개를 추가한다.
- 열린 파일 에디터 헤더에는 버튼 2개를 추가한다.
  - `절대경로`
  - `상대경로`
- 버튼/메뉴 텍스트는 한국어로 유지한다.

### 3. 복사 피드백

- 브라우저 clipboard API를 사용한다.
- 성공 시 액션 텍스트를 짧게 `복사됨` 상태로 바꿨다가 자동 복귀한다.
- 실패 시 기존 파일 상태 배너(`fileStatus`) 또는 에디터 내부 상태 문구로 간단히 알린다.
- 별도 전역 토스트는 도입하지 않는다.

### 4. 상태 관리

- `CustomizationSidebar`는 파일 트리 메뉴 복사 상태를 path + kind 단위로 관리한다.
- `WorkspaceFileEditor`는 현재 열린 파일에 대한 복사 상태를 독립적으로 관리한다.
- 복사 helper는 Promise 기반으로 두고, UI는 각 위치에서 상태만 관리한다.

## 테스트 계획

- Vitest helper 테스트를 먼저 추가한다.
- 최소 케이스:
  - root 자체를 상대경로로 계산하면 `.`
  - root 하위 파일은 root 기준 상대경로 반환
  - 슬래시 중복/후행 슬래시를 정규화해도 일관된 결과 반환
  - root 밖 경로는 fallback 동작 유지

## 구현 순서

1. 경로 계산 helper와 테스트 추가
2. 파일 트리 메뉴에 경로 복사 액션 연결
3. 파일 에디터 헤더에 경로 복사 버튼 추가
4. 관련 테스트와 타입체크 실행

## 리스크

- 경로 helper가 `CustomizationSidebar` 내부 함수에 묶여 있으면 재사용 시 중복이 생길 수 있다.
- clipboard API 실패 환경이 일부 존재할 수 있으므로 실패 피드백을 반드시 남겨야 한다.
