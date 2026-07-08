import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { collectProjectSkills } from '@/lib/projectSkills';

describe('collectProjectSkills', () => {
  let projectDir: string;
  let homeDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aris-skills-project-'));
    homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aris-skills-home-'));
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
    await fs.rm(homeDir, { recursive: true, force: true });
  });

  const write = async (root: string, relativePath: string, content: string) => {
    const filePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
  };

  it('collects project commands/skills and user commands/skills in priority order', async () => {
    await write(projectDir, '.claude/commands/deploy.md', '---\ndescription: 배포 스크립트 실행\n---\n본문');
    await write(projectDir, '.claude/skills/review/SKILL.md', '---\nname: review\ndescription: 코드 리뷰 스킬\n---\n지침');
    await write(homeDir, '.claude/commands/babysit.md', '# no frontmatter');
    await write(homeDir, '.claude/skills/research/SKILL.md', '---\ndescription: 리서치 하네스\n---\n');

    const entries = await collectProjectSkills({ projectPath: projectDir, userHomeDir: homeDir });

    expect(entries.map((entry) => [entry.command, entry.source])).toEqual([
      ['/deploy', 'project-command'],
      ['/review', 'project-skill'],
      ['/babysit', 'user-command'],
      ['/research', 'user-skill'],
    ]);
    expect(entries[0].description).toBe('배포 스크립트 실행');
    expect(entries[1].description).toBe('코드 리뷰 스킬');
    expect(entries[2].description).toBeNull();
  });

  it('folds YAML block-scalar descriptions instead of returning the indicator', async () => {
    await write(
      homeDir,
      '.claude/skills/research/SKILL.md',
      '---\nname: research\ndescription: >\n  멀티 스텝 리서치\n  워크플로우\n---\n',
    );

    const entries = await collectProjectSkills({ projectPath: null, userHomeDir: homeDir });

    expect(entries[0].description).toBe('멀티 스텝 리서치 워크플로우');
  });

  it('namespaces nested command directories and ignores non-markdown files', async () => {
    await write(projectDir, '.claude/commands/git/commit.md', '커밋 커맨드');
    await write(projectDir, '.claude/commands/notes.txt', '무시되어야 함');

    const entries = await collectProjectSkills({ projectPath: projectDir, userHomeDir: homeDir });

    expect(entries.map((entry) => entry.command)).toEqual(['/git:commit']);
  });

  it('lets a project-scope command shadow the same user-scope command name', async () => {
    await write(projectDir, '.claude/commands/deploy.md', '프로젝트 배포');
    await write(homeDir, '.claude/commands/deploy.md', '---\ndescription: 사용자 배포\n---\n');

    const entries = await collectProjectSkills({ projectPath: projectDir, userHomeDir: homeDir });

    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('project-command');
  });

  it('skips skill directories without SKILL.md and missing roots gracefully', async () => {
    await write(projectDir, '.claude/skills/empty/README.md', 'SKILL.md 없음');

    const entries = await collectProjectSkills({ projectPath: projectDir, userHomeDir: path.join(homeDir, 'missing') });

    expect(entries).toEqual([]);
  });

  it('returns an empty list when projectPath is null and home has no entries', async () => {
    const entries = await collectProjectSkills({ projectPath: null, userHomeDir: homeDir });
    expect(entries).toEqual([]);
  });
});
