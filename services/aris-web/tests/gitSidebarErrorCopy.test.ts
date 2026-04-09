import { describe, expect, it } from 'vitest';
import { describeGitSidebarError } from '@/lib/git/sidebarErrors';

describe('git sidebar error copy', () => {
  it('explains dubious ownership errors with guidance', () => {
    expect(describeGitSidebarError("fatal: detected dubious ownership in repository at '/workspace/ARIS'")).toEqual({
      title: '작업공간 권한을 다시 확인해 주세요',
      detail: 'Git이 이 워크스페이스를 안전한 저장소로 아직 인식하지 못했습니다.',
      hint: '잠시 후 다시 시도해도 안 되면 런타임을 재시작한 뒤 Git 메뉴를 다시 열어 보세요.',
    });
  });

  it('explains missing git binaries', () => {
    expect(describeGitSidebarError('Git CLI를 찾을 수 없습니다. 런타임 이미지에 git이 설치되어 있는지 확인해 주세요.')).toEqual({
      title: 'Git 실행 파일이 없습니다',
      detail: '런타임 이미지에 git이 설치되어 있지 않아서 Git 메뉴를 사용할 수 없습니다.',
      hint: '컨테이너 이미지에 git을 포함한 뒤 런타임을 다시 시작해 주세요.',
    });
  });
});
