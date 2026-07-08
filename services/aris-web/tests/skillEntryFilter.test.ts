import { describe, expect, it } from 'vitest';
import {
  filterSkillEntriesForAutocomplete,
  findArgumentHintEntry,
} from '@/components/project-chat/helpers/skillEntries';
import type { ProjectSkillEntry } from '@/lib/projectSkills';

function entry(name: string, description: string | null = null, argumentHint: string | null = null): ProjectSkillEntry {
  return {
    id: `user-command:${name}`,
    name,
    command: `/${name}`,
    description,
    argumentHint,
    source: 'user-command',
  };
}

const ENTRIES = [
  entry('deploy', '배포 실행'),
  entry('review', '코드 리뷰'),
  entry('research-flow', '리서치 워크플로우'),
  entry('pre-review', '사전 리뷰'),
];

describe('filterSkillEntriesForAutocomplete', () => {
  it('ranks prefix matches before substring matches', () => {
    const result = filterSkillEntriesForAutocomplete(ENTRIES, 're');
    expect(result.map((item) => item.command)).toEqual([
      '/review',
      '/research-flow',
      '/pre-review',
    ]);
  });

  it('does not match against descriptions', () => {
    expect(filterSkillEntriesForAutocomplete(ENTRIES, '배포')).toEqual([]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterSkillEntriesForAutocomplete(ENTRIES, 'zzz-none')).toEqual([]);
  });

  it('pins recent commands first for an empty query', () => {
    const result = filterSkillEntriesForAutocomplete(ENTRIES, '', ['/research-flow', '/deploy']);
    expect(result.map((item) => item.command)).toEqual([
      '/research-flow',
      '/deploy',
      '/review',
      '/pre-review',
    ]);
  });

  it('applies the result limit', () => {
    const many = Array.from({ length: 10 }, (_, index) => entry(`skill-${index}`));
    expect(filterSkillEntriesForAutocomplete(many, 'skill', [], 6)).toHaveLength(6);
  });
});

describe('findArgumentHintEntry', () => {
  const withHint = [entry('deploy', '배포', '[environment]'), entry('review', '리뷰')];

  it('returns the entry right after a command with a hint is selected', () => {
    expect(findArgumentHintEntry(withHint, '/deploy ')?.command).toBe('/deploy');
  });

  it('hides the hint once the user starts typing arguments', () => {
    expect(findArgumentHintEntry(withHint, '/deploy staging')).toBeNull();
    expect(findArgumentHintEntry(withHint, '/deploy s')).toBeNull();
  });

  it('returns null while the slash token is still being typed', () => {
    expect(findArgumentHintEntry(withHint, '/deploy')).toBeNull();
  });

  it('returns null for commands without an argument hint', () => {
    expect(findArgumentHintEntry(withHint, '/review ')).toBeNull();
  });

  it('returns null for unknown commands and plain prompts', () => {
    expect(findArgumentHintEntry(withHint, '/unknown ')).toBeNull();
    expect(findArgumentHintEntry(withHint, '안녕하세요')).toBeNull();
  });
});
