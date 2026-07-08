import type { ProjectSkillEntry } from '@/lib/projectSkills';

export const SKILL_SOURCE_LABELS: Record<ProjectSkillEntry['source'], string> = {
  'project-command': '프로젝트 커맨드',
  'project-skill': '프로젝트 스킬',
  'user-command': '내 커맨드',
  'user-skill': '내 스킬',
  'plugin-command': '플러그인',
  'plugin-skill': '플러그인',
};

export const SLASH_AUTOCOMPLETE_LIMIT = 6;

/**
 * 컴포저 인라인 자동완성용 필터.
 * 정밀도가 중요하므로 커맨드/이름만 매칭한다(설명 제외).
 * prefix 일치를 substring 일치보다 앞세우고, 쿼리가 비어 있으면
 * 최근 사용 커맨드를 상단에 배치한다.
 */
export function filterSkillEntriesForAutocomplete(
  entries: ProjectSkillEntry[],
  rawQuery: string,
  recentCommands: string[] = [],
  limit: number = SLASH_AUTOCOMPLETE_LIMIT,
): ProjectSkillEntry[] {
  const query = rawQuery.trim().toLowerCase();

  if (!query) {
    const recent = recentCommands
      .map((command) => entries.find((entry) => entry.command === command))
      .filter((entry): entry is ProjectSkillEntry => Boolean(entry));
    const rest = entries.filter((entry) => !recentCommands.includes(entry.command));
    return [...recent, ...rest].slice(0, limit);
  }

  const prefixMatches: ProjectSkillEntry[] = [];
  const substringMatches: ProjectSkillEntry[] = [];
  for (const entry of entries) {
    const name = entry.command.slice(1).toLowerCase();
    if (name.startsWith(query)) {
      prefixMatches.push(entry);
    } else if (name.includes(query)) {
      substringMatches.push(entry);
    }
  }
  return [...prefixMatches, ...substringMatches].slice(0, limit);
}

/**
 * 프롬프트가 `/커맨드 `로 시작하고 아직 인자를 입력하지 않은 상태라면,
 * 인자 힌트를 보여줄 스킬 엔트리를 찾는다.
 */
export function findArgumentHintEntry(
  entries: ProjectSkillEntry[],
  prompt: string,
): ProjectSkillEntry | null {
  const match = /^(\/\S+)\s+(.*)$/s.exec(prompt);
  if (!match || match[2].trim()) {
    return null;
  }
  const entry = entries.find((candidate) => candidate.command === match[1]);
  return entry?.argumentHint ? entry : null;
}
