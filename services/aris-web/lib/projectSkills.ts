import fs from 'node:fs/promises';
import path from 'node:path';

export type ProjectSkillSource =
  | 'project-command'
  | 'project-skill'
  | 'user-command'
  | 'user-skill'
  | 'plugin-command'
  | 'plugin-skill';

export type ProjectSkillEntry = {
  id: string;
  name: string;
  /** 컴포저에 삽입되는 슬래시 커맨드 (예: "/deploy") */
  command: string;
  description: string | null;
  /** 커맨드 frontmatter의 argument-hint (예: "[environment]") */
  argumentHint: string | null;
  source: ProjectSkillSource;
};

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_COMMAND_DIR_DEPTH = 2;

function normalizeFrontmatterValue(value: string): string | null {
  const cleaned = value.replace(/^['"]|['"]$/g, '').trim();
  return cleaned ? cleaned.slice(0, MAX_DESCRIPTION_LENGTH) : null;
}

function readFrontmatterField(markdown: string, field: string): string | null {
  const frontmatter = FRONTMATTER_PATTERN.exec(markdown)?.[1];
  if (!frontmatter) {
    return null;
  }
  const fieldPattern = new RegExp(`^${field}:\\s*(.*)$`);
  const lines = frontmatter.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = fieldPattern.exec(lines[index]);
    if (!match) {
      continue;
    }
    const inline = match[1].trim();
    // YAML 블록 스칼라(>, |, >- 등)는 이어지는 들여쓰기 줄들을 접어서 사용한다.
    if (inline && !/^[>|][+-]?$/.test(inline)) {
      return normalizeFrontmatterValue(inline);
    }
    const collected: string[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next];
      if (!line.trim()) {
        if (collected.length > 0) break;
        continue;
      }
      if (!/^\s/.test(line)) {
        break;
      }
      collected.push(line.trim());
    }
    return collected.length > 0 ? normalizeFrontmatterValue(collected.join(' ')) : null;
  }
  return null;
}

type SkillFileMeta = { description: string | null; argumentHint: string | null };

async function readSkillFileMeta(filePath: string): Promise<SkillFileMeta> {
  try {
    const markdown = await fs.readFile(filePath, 'utf8');
    return {
      description: readFrontmatterField(markdown, 'description'),
      argumentHint: readFrontmatterField(markdown, 'argument-hint'),
    };
  } catch {
    return { description: null, argumentHint: null };
  }
}

async function listDirents(dirPath: string) {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** `.claude/commands/**.md` → 슬래시 커맨드. 하위 폴더는 `dir:name`으로 네임스페이스한다. */
async function collectCommandEntries(
  rootDir: string,
  source: ProjectSkillSource,
  idPrefix = '',
): Promise<ProjectSkillEntry[]> {
  const entries: ProjectSkillEntry[] = [];

  const walk = async (dirPath: string, prefix: string, depth: number) => {
    for (const dirent of await listDirents(dirPath)) {
      if (dirent.isDirectory()) {
        if (depth < MAX_COMMAND_DIR_DEPTH) {
          await walk(path.join(dirPath, dirent.name), `${prefix}${dirent.name}:`, depth + 1);
        }
        continue;
      }
      if (!dirent.isFile() || !dirent.name.endsWith('.md')) {
        continue;
      }
      const name = `${prefix}${dirent.name.slice(0, -3)}`;
      const meta = await readSkillFileMeta(path.join(dirPath, dirent.name));
      entries.push({
        id: `${source}:${idPrefix}${name}`,
        name,
        command: `/${name}`,
        description: meta.description,
        argumentHint: meta.argumentHint,
        source,
      });
    }
  };

  await walk(rootDir, '', 0);
  return entries;
}

/** `.claude/skills/<name>/SKILL.md` → 스킬. */
async function collectSkillEntries(
  rootDir: string,
  source: ProjectSkillSource,
  idPrefix = '',
): Promise<ProjectSkillEntry[]> {
  const entries: ProjectSkillEntry[] = [];
  for (const dirent of await listDirents(rootDir)) {
    if (!dirent.isDirectory()) {
      continue;
    }
    const skillFile = path.join(rootDir, dirent.name, 'SKILL.md');
    try {
      await fs.access(skillFile);
    } catch {
      continue;
    }
    const meta = await readSkillFileMeta(skillFile);
    entries.push({
      id: `${source}:${idPrefix}${dirent.name}`,
      name: dirent.name,
      command: `/${dirent.name}`,
      description: meta.description,
      argumentHint: meta.argumentHint,
      source,
    });
  }
  return entries;
}

function hasPluginContent(dirents: Awaited<ReturnType<typeof listDirents>>): boolean {
  return dirents.some((dirent) => dirent.isDirectory() && (dirent.name === 'commands' || dirent.name === 'skills'));
}

/**
 * `~/.claude/plugins` 아래에서 `commands/`·`skills/`를 가진 플러그인 디렉터리를
 * 찾아 스캔한다. 마켓플레이스 중첩(플러그인이 한 단계 아래에 있는 경우)도
 * 1단계까지 따라간다. `data/` 등 플러그인 데이터 디렉터리는 구조상 걸리지 않는다.
 */
async function collectPluginEntries(pluginsRoot: string): Promise<ProjectSkillEntry[]> {
  const entries: ProjectSkillEntry[] = [];

  const scanPluginDir = async (pluginDir: string, pluginName: string) => {
    const [commands, skills] = await Promise.all([
      collectCommandEntries(path.join(pluginDir, 'commands'), 'plugin-command', `${pluginName}/`),
      collectSkillEntries(path.join(pluginDir, 'skills'), 'plugin-skill', `${pluginName}/`),
    ]);
    entries.push(...commands, ...skills);
  };

  for (const dirent of await listDirents(pluginsRoot)) {
    if (!dirent.isDirectory() || dirent.name.startsWith('.')) {
      continue;
    }
    const level1 = path.join(pluginsRoot, dirent.name);
    const level1Dirents = await listDirents(level1);
    if (hasPluginContent(level1Dirents)) {
      await scanPluginDir(level1, dirent.name);
      continue;
    }
    for (const nested of level1Dirents) {
      if (!nested.isDirectory() || nested.name.startsWith('.')) {
        continue;
      }
      const level2 = path.join(level1, nested.name);
      if (hasPluginContent(await listDirents(level2))) {
        await scanPluginDir(level2, nested.name);
      }
    }
  }
  return entries;
}

function sortByName(entries: ProjectSkillEntry[]): ProjectSkillEntry[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 프로젝트/사용자/플러그인 스코프의 슬래시 커맨드·스킬을 수집한다.
 * 우선순위(프로젝트 커맨드 → 프로젝트 스킬 → 사용자 커맨드 → 사용자 스킬 →
 * 플러그인)로 정렬하고, 동일한 커맨드 이름은 상위 스코프가 가린다.
 */
export async function collectProjectSkills({
  projectPath,
  userHomeDir,
}: {
  projectPath: string | null;
  userHomeDir: string | null;
}): Promise<ProjectSkillEntry[]> {
  const [projectCommands, projectSkills, userCommands, userSkills, pluginEntries] = await Promise.all([
    projectPath ? collectCommandEntries(path.join(projectPath, '.claude', 'commands'), 'project-command') : Promise.resolve([]),
    projectPath ? collectSkillEntries(path.join(projectPath, '.claude', 'skills'), 'project-skill') : Promise.resolve([]),
    userHomeDir ? collectCommandEntries(path.join(userHomeDir, '.claude', 'commands'), 'user-command') : Promise.resolve([]),
    userHomeDir ? collectSkillEntries(path.join(userHomeDir, '.claude', 'skills'), 'user-skill') : Promise.resolve([]),
    userHomeDir ? collectPluginEntries(path.join(userHomeDir, '.claude', 'plugins')) : Promise.resolve([]),
  ]);

  const merged: ProjectSkillEntry[] = [];
  const seenCommands = new Set<string>();
  for (const group of [projectCommands, projectSkills, userCommands, userSkills, pluginEntries]) {
    for (const entry of sortByName(group)) {
      if (seenCommands.has(entry.command)) {
        continue;
      }
      seenCommands.add(entry.command);
      merged.push(entry);
    }
  }
  return merged;
}
