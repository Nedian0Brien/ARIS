# 채팅 파일 배지 라인 이동 설계

## 목표

채팅 버블의 파일 배지를 클릭할 때 `:line` 정보가 있으면 해당 파일 편집기에서 목표 라인으로 스크롤하고 임시 하이라이트한다. 마크다운 파일은 preview 모드를 유지한 채 source-line 기준으로 가장 가까운 블록으로 이동한다.

## 범위

- 파일 배지 클릭 이벤트 payload에 `line` 정보를 보존한다.
- `CustomizationSidebar`의 파일 열기 흐름이 `line`을 전달하도록 확장한다.
- 일반 코드 파일은 코드 뷰에서 목표 라인으로 스크롤하고 하이라이트한다.
- 마크다운 파일은 preview 모드에서 `data-source-line`이 있는 블록으로 스크롤하고 하이라이트한다.

## 설계

### 1. 파일 열기 payload 확장

- `WorkspaceFileOpenDetail`
- `SidebarFileRequest`
- `RequestedFilePayload`

에 `line?: number | null`을 추가한다.

### 2. 코드 파일 라인 이동

`WorkspaceFileEditor`에 요청 라인 prop을 추가하고, 요청이 들어오면:

- 콘텐츠 기준으로 라인을 clamp
- 해당 줄의 시작/끝 selection 범위를 계산
- textarea/pre/line-number scroll을 동기화
- gutter와 코드 영역에 임시 하이라이트를 표시

### 3. 마크다운 preview 라인 이동

마크다운 body를 `marked.lexer()`로 토큰화하고 top-level block token의 `raw` 길이로 source line을 누적 계산한다.

- 각 top-level block을 `<div data-source-line="...">...</div>`로 감싼다.
- 요청 라인 이상에서 가장 가까운 block이 있으면 그것으로 이동
- 없으면 이전 block 중 가장 가까운 block으로 폴백
- frontmatter가 있으면 body 시작 line offset을 반영한다.

## 테스트 전략

- 코드 뷰용 line clamp/selection helper 테스트
- 마크다운 preview source-line HTML 생성 테스트
- 마크다운 nearest-block 선택 테스트
