export type GitSidebarErrorDetails = {
  title: string;
  detail: string;
  hint: string | null;
};

const SAFE_DIRECTORY_PATTERN = /detected dubious ownership|safe\.directory|unsafe repository/i;
const MISSING_GIT_PATTERN = /Git CLI를 찾을 수 없습니다/i;
const NO_REPOSITORY_PATTERN = /Git 저장소를 찾을 수 없습니다/i;

export function describeGitSidebarError(message: string): GitSidebarErrorDetails {
  if (SAFE_DIRECTORY_PATTERN.test(message)) {
    return {
      title: '작업공간 권한을 다시 확인해 주세요',
      detail: 'Git이 이 워크스페이스를 안전한 저장소로 아직 인식하지 못했습니다.',
      hint: '잠시 후 다시 시도해도 안 되면 런타임을 재시작한 뒤 Git 메뉴를 다시 열어 보세요.',
    };
  }

  if (MISSING_GIT_PATTERN.test(message)) {
    return {
      title: 'Git 실행 파일이 없습니다',
      detail: '런타임 이미지에 git이 설치되어 있지 않아서 Git 메뉴를 사용할 수 없습니다.',
      hint: '컨테이너 이미지에 git을 포함한 뒤 런타임을 다시 시작해 주세요.',
    };
  }

  if (NO_REPOSITORY_PATTERN.test(message)) {
    return {
      title: 'Git 저장소를 찾지 못했습니다',
      detail: '이 경로에는 Git 저장소 메타데이터가 없어서 상태를 읽을 수 없습니다.',
      hint: '워크스페이스 루트가 맞는지 확인한 뒤 다시 시도해 주세요.',
    };
  }

  return {
    title: 'Git 정보를 불러오지 못했습니다',
    detail: message,
    hint: '새로고침 후에도 계속되면 Git 메뉴에서 다시 시도해 주세요.',
  };
}
