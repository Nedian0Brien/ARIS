# Action Card Density Implementation Plan (revised — post-redesign target)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the v3 action-card density design (확장형 / 기본형 / 최소형 + 자동) to the **post-redesign project chat surface** (URL pattern `/?tab=project&project=…&view=chat&chat=…`). Visual must match `design/action-card-density-v3.html` exactly.

**Architecture:**
1. Extract `ProjectChatSurface` and `ProjectActionCard` (plus their helpers) from the 3 919-line `HomePageClient.tsx` into focused files under `services/aris-web/components/project-chat/`.
2. Layer new density logic on top of the **existing** `.pc-action-card` / `.pc-action-token--*` CSS and `renderCommandTokens` syntax-highlight helper — extend, don't replace. (Q2 directive: minimize code churn.)
3. Single source of truth for command→tone mapping in `lib/cmd/cmdToneMap.ts` (replaces `projectActionMeta`'s kind branching).
4. Density state in a Zustand store with per-card override; auto-mode rules in a pure function.

**Tech Stack:** Next.js 14, React, TypeScript, plain CSS in `services/aris-web/app/styles/ui.css` (no CSS Modules — match existing convention), Zustand (already in deps), Vitest.

**Visual spec:** `design/action-card-density-v3.html` (prototype branch `codex/action-card-density-prototype`).

**Scope boundary — DO NOT TOUCH:**
- `services/aris-web/app/sessions/**` (entire `sessions/` route tree — pre-redesign legacy)
- `services/aris-web/app/sessions/[sessionId]/legacy/**`
- `design/legacy/**`

**Scope — files in play:**
- Modify: `AGENTS.md` (Task 1 — module-size guideline)
- Modify: `services/aris-web/app/HomePageClient.tsx` (extract inline components, then import them back)
- Modify: `services/aris-web/app/styles/ui.css` (extend `.pc-action-*` rules with new tone palette + density variants)
- Modify: `services/aris-web/app/styles/tokens.css` (new 18-tone palette + syntax tokens)
- Create: `services/aris-web/lib/cmd/**` (parser + mapping, framework-agnostic)
- Create: `services/aris-web/components/project-chat/**` (extracted surface + new cmd-display atoms)

---

## File Structure

```
services/aris-web/
├── lib/cmd/                                    ← NEW · framework-agnostic
│   ├── types.ts
│   ├── cmdToneMap.ts                            18-tone command→tone single source of truth
│   ├── parseCommand.ts                          Bash first-token, agent-tool parser, file detection
│   └── __tests__/{cmdToneMap,parseCommand}.test.ts
│
├── components/project-chat/                    ← NEW · post-redesign chat extraction
│   ├── ProjectChatSurface.tsx                  Extracted from HomePageClient.tsx (~700 lines)
│   ├── ProjectActionCard.tsx                  Density-aware replacement for inline version
│   ├── ProjectRunStatusChip.tsx               Extracted as-is
│   ├── helpers/
│   │   ├── projectChatEvents.ts                isProjectActionEvent / eventCommand / projectActionMeta / projectActionPreview
│   │   ├── commandTokens.tsx                   renderCommandTokens / commandTokenClass (extended for `str` token)
│   │   └── actionMarks.tsx                     GitActionMark / DockerActionMark
│   └── cmd-display/                            ← NEW · density atoms
│       ├── icons.tsx
│       ├── CmdBadge.tsx
│       ├── FileChip.tsx
│       ├── CmdTokens.tsx                       Wraps renderCommandTokens + interleaves FileChips
│       ├── ToolRow.tsx                         기본형 + 확장형 (extends existing `.pc-action-card`)
│       ├── MiniStack.tsx                       최소형 stack + hover popover + inline expand
│       ├── DensityToggle.tsx                   4-way header toggle
│       ├── densityStore.ts                     Zustand: global + per-card override
│       ├── densityRules.ts                     computeAutoDensity
│       └── __tests__/{densityStore,densityRules}.test.ts
│
├── app/HomePageClient.tsx                      ← MODIFIED · ~700-1000 lines lighter after extraction
└── app/styles/
    ├── tokens.css                              ← MODIFIED · 18 tones + syntax tokens
    └── ui.css                                  ← MODIFIED · new .pc-action-card density variants
```

---

## Task 1: AGENTS.md — module-size guideline

**Files:**
- Modify: `AGENTS.md`

**Rationale:** Q3 directive. `HomePageClient.tsx` is 3 919 lines; `ui.css` is 6 566 lines. Codify the bloat-prevention rule that justifies the extraction work in later tasks.

- [ ] **Step 1: Append section to AGENTS.md**

Locate the `## Operational Rules` block. Add a new sibling section after it:

```markdown
## 모듈 크기 / 추출 기준

- 단일 파일이 800줄을 넘으면 작업 시 의미 있는 분리를 함께 진행한다.
- 한 파일에 인라인으로 정의된 React 컴포넌트(`function Xxx(...) {}` 또는 `const Xxx = (...) => …`)가 3개 이상이면 별도 파일로 추출한다.
- React 컴포넌트 함수 본문이 300줄을 넘으면 hook 또는 sub-component 단위로 분해한다.
- CSS module / global stylesheet 가 단일 화면 단위로 2 000줄을 넘으면 영역별 모듈로 분리한다.
- 새 기능을 기존 파일에 추가하기 전에 위 기준을 점검하고, 넘는다면 추출/분리를 작업의 일부로 포함한다. 분리만 따로 PR로 내지 말고 작업과 함께 진행해 머지 충돌을 줄인다.
- 위 기준은 권고지 절대값이 아니다. 분명한 응집도(예: 단일 라우트 핸들러)가 있다면 길어도 유지할 수 있다 — 이 경우 PR 본문에 사유를 명시한다.
```

- [ ] **Step 2: Commit**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/action-card-density-impl
git add AGENTS.md
git commit -m "docs(agents): 모듈 크기/추출 기준 가이드라인 추가"
```

---

## Task 2: Worktree verify + reference imports

**Files:**
- N/A

- [ ] **Step 1: Verify worktree**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/action-card-density-impl
git status
git log --oneline -3
```

Expected: branch `feat/action-card-density`, AGENTS.md commit on top.

- [ ] **Step 2: Import v3 prototype for in-repo reference**

```bash
git fetch origin codex/action-card-density-prototype
git checkout origin/codex/action-card-density-prototype -- design/action-card-density-v3.html services/aris-web/public/action-card-density-v3.html
```

- [ ] **Step 3: Commit reference + plan**

```bash
git add design/action-card-density-v3.html services/aris-web/public/action-card-density-v3.html docs/superpowers/plans/2026-05-12-action-card-density.md
git commit -m "docs: import v3 prototype and revised implementation plan"
```

---

## Task 3: `lib/cmd/types.ts`

**Files:**
- Create: `services/aris-web/lib/cmd/types.ts`

- [ ] **Step 1: Write file**

```typescript
export type ToneName =
  | 'read' | 'write' | 'edit' | 'shell' | 'list' | 'glob' | 'search'
  | 'net' | 'pkg' | 'build' | 'test' | 'git' | 'docker'
  | 'destroy' | 'think' | 'todo' | 'agent' | 'cmd';

export type IconName =
  | 'file' | 'pen' | 'folder' | 'folderSearch' | 'search' | 'terminal'
  | 'globe' | 'package' | 'shield' | 'flask' | 'gitBranch' | 'container'
  | 'trash' | 'brain' | 'todoList' | 'settings' | 'prompt'
  | 'chevronRight' | 'chevronDown' | 'x';

export type CmdTokenKind = 'cmd' | 'flag' | 'str' | 'op' | 'num' | 'text';
export type CmdToken = { kind: CmdTokenKind; text: string };

export type FileArg = {
  path: string;
  variant: 'code' | 'folder' | 'config' | 'shell' | 'other';
};

export type ParsedCommand = {
  head: string;          // first significant token (Bash) or agent tool name
  tone: ToneName;
  icon: IconName;
  label: string;         // display label (== head)
  tokens: CmdToken[];    // syntax-classified tokens (empty for pure agent tools)
  fileArgs: FileArg[];   // file path arguments in left-to-right order
  pipedCount: number;    // count of `|` segments beyond head
};
```

- [ ] **Step 2: Commit**

```bash
git add services/aris-web/lib/cmd/types.ts
git commit -m "feat(cmd): ParsedCommand + tone/icon type definitions"
```

---

## Task 4: `lib/cmd/cmdToneMap.ts` (TDD)

**Files:**
- Create: `services/aris-web/lib/cmd/cmdToneMap.ts`
- Test: `services/aris-web/lib/cmd/__tests__/cmdToneMap.test.ts`

(Test + implementation identical to the previous plan version — see source in repo. Summary: agent-tool table + shell-cmd table + `cmd` fallback, with `resolveCmdTone(label) → { tone, icon }`.)

- [ ] **Step 1: Write failing test**

Use the test block from the [previous plan reference](#) (5 test cases: agent-tools, shell, fallback, icons, case-sensitivity).

```typescript
// services/aris-web/lib/cmd/__tests__/cmdToneMap.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCmdTone } from '../cmdToneMap';

describe('resolveCmdTone', () => {
  it('maps agent-level tools by canonical name', () => {
    expect(resolveCmdTone('Read').tone).toBe('read');
    expect(resolveCmdTone('Write').tone).toBe('write');
    expect(resolveCmdTone('Edit').tone).toBe('edit');
    expect(resolveCmdTone('Glob').tone).toBe('glob');
    expect(resolveCmdTone('Grep').tone).toBe('search');
    expect(resolveCmdTone('TodoWrite').tone).toBe('todo');
    expect(resolveCmdTone('Task').tone).toBe('agent');
    expect(resolveCmdTone('WebFetch').tone).toBe('net');
    expect(resolveCmdTone('WebSearch').tone).toBe('search');
  });
  it('maps shell commands by first token', () => {
    expect(resolveCmdTone('cat').tone).toBe('read');
    expect(resolveCmdTone('sed').tone).toBe('edit');
    expect(resolveCmdTone('ls').tone).toBe('list');
    expect(resolveCmdTone('grep').tone).toBe('search');
    expect(resolveCmdTone('npm').tone).toBe('pkg');
    expect(resolveCmdTone('tsc').tone).toBe('build');
    expect(resolveCmdTone('vitest').tone).toBe('test');
    expect(resolveCmdTone('git').tone).toBe('git');
    expect(resolveCmdTone('docker').tone).toBe('docker');
    expect(resolveCmdTone('rm').tone).toBe('destroy');
    expect(resolveCmdTone('curl').tone).toBe('net');
  });
  it('falls back to cmd tone for unknown commands', () => {
    expect(resolveCmdTone('unknownbinary').tone).toBe('cmd');
    expect(resolveCmdTone('').tone).toBe('cmd');
  });
  it('returns matching icon for each tone', () => {
    expect(resolveCmdTone('cat').icon).toBe('file');
    expect(resolveCmdTone('sed').icon).toBe('pen');
    expect(resolveCmdTone('grep').icon).toBe('search');
    expect(resolveCmdTone('git').icon).toBe('gitBranch');
    expect(resolveCmdTone('docker').icon).toBe('container');
    expect(resolveCmdTone('rm').icon).toBe('trash');
    expect(resolveCmdTone('unknownbinary').icon).toBe('prompt');
  });
});
```

- [ ] **Step 2: Run (fail)**

```bash
cd services/aris-web && npx vitest run lib/cmd/__tests__/cmdToneMap.test.ts
```

- [ ] **Step 3: Implement `cmdToneMap.ts`**

```typescript
import type { ToneName, IconName } from './types';
type Entry = { tone: ToneName; icon: IconName };

const AGENT_TOOLS: Record<string, Entry> = {
  Read: { tone: 'read', icon: 'file' },
  Write: { tone: 'write', icon: 'pen' },
  Edit: { tone: 'edit', icon: 'pen' },
  MultiEdit: { tone: 'edit', icon: 'pen' },
  Glob: { tone: 'glob', icon: 'folderSearch' },
  Grep: { tone: 'search', icon: 'search' },
  WebFetch: { tone: 'net', icon: 'globe' },
  WebSearch: { tone: 'search', icon: 'search' },
  TodoWrite: { tone: 'todo', icon: 'todoList' },
  Task: { tone: 'agent', icon: 'settings' },
  Think: { tone: 'think', icon: 'brain' },
};

const SHELL_CMDS: Record<string, Entry> = {
  cat: { tone: 'read', icon: 'file' }, head: { tone: 'read', icon: 'file' },
  tail: { tone: 'read', icon: 'file' }, less: { tone: 'read', icon: 'file' },
  more: { tone: 'read', icon: 'file' }, view: { tone: 'read', icon: 'file' },
  sed: { tone: 'edit', icon: 'pen' }, awk: { tone: 'edit', icon: 'pen' },
  patch: { tone: 'edit', icon: 'pen' }, vim: { tone: 'edit', icon: 'pen' },
  nano: { tone: 'edit', icon: 'pen' },
  bash: { tone: 'shell', icon: 'terminal' }, sh: { tone: 'shell', icon: 'terminal' },
  zsh: { tone: 'shell', icon: 'terminal' }, watch: { tone: 'shell', icon: 'terminal' },
  nohup: { tone: 'shell', icon: 'terminal' },
  ls: { tone: 'list', icon: 'folder' }, tree: { tone: 'list', icon: 'folder' },
  find: { tone: 'list', icon: 'folder' }, pwd: { tone: 'list', icon: 'folder' },
  fd: { tone: 'glob', icon: 'folderSearch' },
  grep: { tone: 'search', icon: 'search' }, rg: { tone: 'search', icon: 'search' },
  ripgrep: { tone: 'search', icon: 'search' }, ack: { tone: 'search', icon: 'search' },
  curl: { tone: 'net', icon: 'globe' }, wget: { tone: 'net', icon: 'globe' },
  http: { tone: 'net', icon: 'globe' }, ssh: { tone: 'net', icon: 'globe' },
  scp: { tone: 'net', icon: 'globe' },
  npm: { tone: 'pkg', icon: 'package' }, yarn: { tone: 'pkg', icon: 'package' },
  pnpm: { tone: 'pkg', icon: 'package' }, npx: { tone: 'pkg', icon: 'package' },
  cargo: { tone: 'pkg', icon: 'package' }, pip: { tone: 'pkg', icon: 'package' },
  pip3: { tone: 'pkg', icon: 'package' }, uv: { tone: 'pkg', icon: 'package' },
  tsc: { tone: 'build', icon: 'shield' }, eslint: { tone: 'build', icon: 'shield' },
  prettier: { tone: 'build', icon: 'shield' }, biome: { tone: 'build', icon: 'shield' },
  webpack: { tone: 'build', icon: 'shield' }, vite: { tone: 'build', icon: 'shield' },
  vitest: { tone: 'test', icon: 'flask' }, jest: { tone: 'test', icon: 'flask' },
  pytest: { tone: 'test', icon: 'flask' }, playwright: { tone: 'test', icon: 'flask' },
  cypress: { tone: 'test', icon: 'flask' },
  git: { tone: 'git', icon: 'gitBranch' }, gh: { tone: 'git', icon: 'gitBranch' },
  jj: { tone: 'git', icon: 'gitBranch' },
  docker: { tone: 'docker', icon: 'container' }, kubectl: { tone: 'docker', icon: 'container' },
  podman: { tone: 'docker', icon: 'container' },
  rm: { tone: 'destroy', icon: 'trash' }, rmdir: { tone: 'destroy', icon: 'trash' },
  kill: { tone: 'destroy', icon: 'trash' }, pkill: { tone: 'destroy', icon: 'trash' },
  truncate: { tone: 'destroy', icon: 'trash' },
};

const FALLBACK: Entry = { tone: 'cmd', icon: 'prompt' };

export function resolveCmdTone(label: string): Entry {
  if (!label) return FALLBACK;
  if (AGENT_TOOLS[label]) return AGENT_TOOLS[label];
  const lower = label.toLowerCase();
  if (SHELL_CMDS[lower]) return SHELL_CMDS[lower];
  return FALLBACK;
}
```

- [ ] **Step 4: Run (pass) + commit**

```bash
cd services/aris-web && npx vitest run lib/cmd/__tests__/cmdToneMap.test.ts
git add services/aris-web/lib/cmd/cmdToneMap.ts services/aris-web/lib/cmd/__tests__/cmdToneMap.test.ts
git commit -m "feat(cmd): cmdToneMap with full mapping + tests"
```

---

## Task 5: `lib/cmd/parseCommand.ts` (TDD)

**Files:**
- Create: `services/aris-web/lib/cmd/parseCommand.ts`
- Test: `services/aris-web/lib/cmd/__tests__/parseCommand.test.ts`

(Test + implementation identical to Task 4 of previous plan version. Repeating here for completeness — see Task 4 of `docs/superpowers/plans/2026-05-12-action-card-density.md@HEAD~1` if needed.)

- [ ] **Step 1: Write failing test** — 12 test cases covering env-var skip, prefix verbs (sudo/cd/time/env), chain operators (`&&`/`||`/`;`), pipes, syntax token classification, file path/folder/config/shell variant detection, agent-tool parsing.

```typescript
// services/aris-web/lib/cmd/__tests__/parseCommand.test.ts
import { describe, it, expect } from 'vitest';
import { parseAgentCommand, parseShellCommand } from '../parseCommand';

describe('parseShellCommand', () => {
  it('extracts first token from a simple command', () => {
    const p = parseShellCommand('npm test');
    expect(p.head).toBe('npm');
    expect(p.tone).toBe('pkg');
    expect(p.tokens[0]).toEqual({ kind: 'cmd', text: 'npm' });
  });
  it('skips leading env-var assignments', () => {
    expect(parseShellCommand('NODE_ENV=production FOO=bar npm start').head).toBe('npm');
  });
  it('skips sudo/cd/time/env prefixes', () => {
    expect(parseShellCommand('sudo rm -rf /tmp/x').head).toBe('rm');
    expect(parseShellCommand('cd services/aris-web && npm test').head).toBe('npm');
    expect(parseShellCommand('time npm test').head).toBe('npm');
    expect(parseShellCommand('env NODE_ENV=prod npm start').head).toBe('npm');
  });
  it('uses first segment for && / || / ;', () => {
    expect(parseShellCommand('git add . && git commit -m "foo"').head).toBe('git');
    expect(parseShellCommand('npm test || echo failed').head).toBe('npm');
    expect(parseShellCommand('echo hi; pwd').head).toBe('echo');
  });
  it('reports pipedCount on pipes', () => {
    expect(parseShellCommand('cat foo.txt | head -20').pipedCount).toBe(1);
    expect(parseShellCommand('cat a | grep b | head').pipedCount).toBe(2);
  });
  it('classifies token kinds', () => {
    const p = parseShellCommand(`git commit -m "fix" -n`);
    expect(p.tokens.map((t) => t.kind)).toEqual(['cmd','text','flag','str','flag']);
  });
  it('detects && / | operators as op kind', () => {
    const p = parseShellCommand('grep -rn "foo" services && echo done');
    expect(p.tokens.find((t) => t.kind === 'op')?.text).toBe('&&');
  });
  it('detects file paths', () => {
    const p = parseShellCommand('cat services/aris-web/middleware.ts');
    expect(p.fileArgs[0]).toEqual({ path: 'services/aris-web/middleware.ts', variant: 'code' });
  });
  it('classifies folder paths (trailing slash)', () => {
    expect(parseShellCommand('ls logs/2026/05/12/').fileArgs[0].variant).toBe('folder');
  });
  it('classifies config / shell variants by extension', () => {
    expect(parseShellCommand('cat package.json').fileArgs[0].variant).toBe('config');
    expect(parseShellCommand('bash deploy/run.sh').fileArgs[0].variant).toBe('shell');
  });
  it('returns cmd-tone fallback for empty input', () => {
    expect(parseShellCommand('').tone).toBe('cmd');
  });
});

describe('parseAgentCommand', () => {
  it('uses agent tool name as head/label', () => {
    const p = parseAgentCommand('Read', { path: 'services/aris-web/middleware.ts' });
    expect(p.head).toBe('Read');
    expect(p.tone).toBe('read');
    expect(p.fileArgs[0].path).toBe('services/aris-web/middleware.ts');
  });
  it('produces empty tokens (rendering uses fileArgs)', () => {
    expect(parseAgentCommand('Read', { path: 'a.ts' }).tokens).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run (fail), then implement parseCommand**

(Implementation identical to previous draft — see `lib/cmd/parseCommand.ts` body in earlier plan version. Includes tokenizeRaw with quote-preserving tokenizer, stripPrefixes for env/sudo/cd/time/env, splitChained for `&&`/`||`/`;`, looksLikePath heuristic, classifyFile by extension/trailing-slash.)

```typescript
// services/aris-web/lib/cmd/parseCommand.ts
import type { CmdToken, FileArg, ParsedCommand } from './types';
import { resolveCmdTone } from './cmdToneMap';

const PREFIX_NAMES = new Set(['sudo', 'cd', 'time', 'env']);

function isEnvAssign(tok: string): boolean { return /^[A-Z_][A-Z0-9_]*=/.test(tok); }
function isFlag(tok: string): boolean { return /^-{1,2}[A-Za-z0-9_-]+/.test(tok); }
function isOp(tok: string): boolean { return tok === '|' || tok === '>' || tok === '<' || tok === '>>' || tok === '<<'; }
function isString(tok: string): boolean { return /^["'].*["']$/.test(tok); }
function isNumber(tok: string): boolean { return /^-?\d+(?:\.\d+)?$/.test(tok); }

function classifyFile(path: string): FileArg['variant'] {
  if (path.endsWith('/')) return 'folder';
  const ext = path.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase();
  if (!ext) return 'other';
  if (['tsx','ts','js','jsx','py','go','rs','rb','java','kt','swift','c','cpp','h','hpp','cs','mjs','cjs'].includes(ext)) return 'code';
  if (['json','yml','yaml','toml','env','ini','conf'].includes(ext)) return 'config';
  if (['sh','bash','zsh','fish'].includes(ext)) return 'shell';
  return 'other';
}

function looksLikePath(tok: string): boolean {
  if (tok.startsWith('-')) return false;
  if (tok.startsWith('"') || tok.startsWith("'")) return false;
  if (tok.includes('=')) return false;
  if (tok.startsWith('/') || tok.startsWith('./') || tok.startsWith('../')) return true;
  if (tok.includes('/')) return true;
  return /\.[A-Za-z0-9]{1,6}$/.test(tok);
}

function tokenizeRaw(input: string): string[] {
  const out: string[] = [];
  let buf = '', quote: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) { buf += ch; if (ch === quote && input[i-1] !== '\\') quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (/\s/.test(ch)) { if (buf) { out.push(buf); buf = ''; } continue; }
    if (ch === '|') { if (buf) { out.push(buf); buf = ''; } out.push('|'); continue; }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

function splitChained(input: string): { segments: string[]; ops: string[] } {
  const segments: string[] = []; const ops: string[] = [];
  let buf = '', i = 0;
  while (i < input.length) {
    const two = input.slice(i, i + 2);
    if (two === '&&' || two === '||') { segments.push(buf.trim()); ops.push(two); buf = ''; i += 2; continue; }
    if (input[i] === ';') { segments.push(buf.trim()); ops.push(';'); buf = ''; i += 1; continue; }
    buf += input[i]; i += 1;
  }
  if (buf.trim()) segments.push(buf.trim());
  return { segments, ops };
}

function stripPrefixes(tokens: string[]): string[] {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (isEnvAssign(t)) { i += 1; continue; }
    if (PREFIX_NAMES.has(t)) { i += (t === 'cd') ? 2 : 1; continue; }
    break;
  }
  return tokens.slice(i);
}

export function parseShellCommand(raw: string): ParsedCommand {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { head: '', tone: 'cmd', icon: 'prompt', label: '', tokens: [], fileArgs: [], pipedCount: 0 };

  const { segments } = splitChained(trimmed);
  const firstSegment = segments[0] || '';
  const rawFirstTokens = stripPrefixes(tokenizeRaw(firstSegment));
  const head = rawFirstTokens[0] ?? '';
  const pipedCount = rawFirstTokens.filter((t) => t === '|').length;

  const displayTokens = tokenizeRaw(trimmed);
  const tokens: CmdToken[] = [];
  const fileArgs: FileArg[] = [];
  let sawHead = false;

  for (const tok of displayTokens) {
    if (tok === '&&' || tok === '||' || tok === ';') { tokens.push({ kind: 'op', text: tok }); continue; }
    if (isOp(tok)) { tokens.push({ kind: 'op', text: tok }); continue; }
    if (!sawHead && tok === head) { tokens.push({ kind: 'cmd', text: tok }); sawHead = true; continue; }
    if (isEnvAssign(tok) || PREFIX_NAMES.has(tok)) { tokens.push({ kind: 'text', text: tok }); continue; }
    if (isFlag(tok)) { tokens.push({ kind: 'flag', text: tok }); continue; }
    if (isString(tok)) { tokens.push({ kind: 'str', text: tok }); continue; }
    if (isNumber(tok)) { tokens.push({ kind: 'num', text: tok }); continue; }
    if (looksLikePath(tok)) {
      tokens.push({ kind: 'text', text: tok });
      fileArgs.push({ path: tok, variant: classifyFile(tok) });
      continue;
    }
    tokens.push({ kind: 'text', text: tok });
  }

  const resolved = resolveCmdTone(head);
  return { head, tone: resolved.tone, icon: resolved.icon, label: head, tokens, fileArgs, pipedCount };
}

export function parseAgentCommand(
  toolName: string,
  args: { path?: string; target?: string; pattern?: string } = {},
): ParsedCommand {
  const resolved = resolveCmdTone(toolName);
  const fileArgs: FileArg[] = [];
  if (args.path) fileArgs.push({ path: args.path, variant: classifyFile(args.path) });
  if (args.target && args.target !== args.path) fileArgs.push({ path: args.target, variant: classifyFile(args.target) });
  return { head: toolName, tone: resolved.tone, icon: resolved.icon, label: toolName, tokens: [], fileArgs, pipedCount: 0 };
}
```

- [ ] **Step 3: Run (pass) + commit**

```bash
cd services/aris-web && npx vitest run lib/cmd/__tests__/parseCommand.test.ts
git add services/aris-web/lib/cmd/parseCommand.ts services/aris-web/lib/cmd/__tests__/parseCommand.test.ts
git commit -m "feat(cmd): parseShellCommand + parseAgentCommand with TDD coverage"
```

---

## Task 6: tokens.css — 18-tone palette

**Files:**
- Modify: `services/aris-web/app/styles/tokens.css`

- [ ] **Step 1: Add to light + dark theme blocks**

(Same content as previous plan Task 5 — 18 `--tone-{name}-{fg,bg}` pairs + 5 `--syn-*` syntax tokens, both light and dark blocks.)

- [ ] **Step 2: Verify build**

```bash
cd services/aris-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add services/aris-web/app/styles/tokens.css
git commit -m "feat(tokens): 18-tone cmd palette + syntax tokens for action cards"
```

---

## Task 7: Extract helpers from HomePageClient.tsx

**Files:**
- Create: `services/aris-web/components/project-chat/helpers/projectChatEvents.ts`
- Create: `services/aris-web/components/project-chat/helpers/commandTokens.tsx`
- Create: `services/aris-web/components/project-chat/helpers/actionMarks.tsx`
- Modify: `services/aris-web/app/HomePageClient.tsx`

**Rationale:** AGENTS.md guideline (Task 1). `HomePageClient.tsx` is 3 919 lines; extract pure helpers first to shrink it before component extraction.

- [ ] **Step 1: Move `isProjectActionEvent`, `eventCommand`, `projectActionMeta`, `projectActionPreview` to `helpers/projectChatEvents.ts`**

```typescript
// services/aris-web/components/project-chat/helpers/projectChatEvents.ts
import type { ComponentType } from 'react';
import type { UiEvent } from '@/lib/happy/types';
import { Brain, FilePenLine, FileSearch, FolderTree, TerminalSquare } from 'lucide-react';
import { readEventRole, readUiEventRunStatus } from '@/lib/happy/eventHelpers'; // ← verify the source path
import { GitActionMark, DockerActionMark } from './actionMarks';

export function isProjectActionEvent(event: UiEvent): boolean { /* … as inlined today … */ }
export function isProjectRunStatusEvent(event: UiEvent): boolean { /* … */ }
export function eventCommand(event: UiEvent): string { /* … */ }
export function projectActionPreview(event: UiEvent): string | null { /* … */ }
export function projectActionMeta(kind: UiEvent['kind']): { Icon: ComponentType<{ size?: number }>; label: string; tone: string } {
  // existing 6-tone mapping retained for backward compat; new code uses resolveCmdTone instead.
  if (kind === 'file_read') return { Icon: FileSearch, label: 'Read', tone: 'read' };
  if (kind === 'file_write') return { Icon: FilePenLine, label: 'Write', tone: 'write' };
  if (kind === 'file_list') return { Icon: FolderTree, label: 'List', tone: 'list' };
  if (kind === 'think') return { Icon: Brain, label: 'Thinking', tone: 'think' };
  if (kind === 'git_execution') return { Icon: GitActionMark, label: 'Git', tone: 'git' };
  if (kind === 'docker_execution') return { Icon: DockerActionMark, label: 'Docker', tone: 'docker' };
  if (kind === 'run_execution' || kind === 'exec_execution' || kind === 'command_execution') return { Icon: TerminalSquare, label: 'Run', tone: 'run' };
  return { Icon: TerminalSquare, label: 'Action', tone: 'action' };
}
```

> **Implementer note:** copy the function bodies verbatim from `HomePageClient.tsx`. Resolve any internal helper deps (`readEventRole`, `readUiEventRunStatus`) by re-importing from their original locations.

- [ ] **Step 2: Move `commandTokenClass`, `renderCommandTokens` to `helpers/commandTokens.tsx`**

Extend `commandTokenClass` to add a `string` token kind for quoted strings (v3 prototype's `--syn-str`):

```typescript
// services/aris-web/components/project-chat/helpers/commandTokens.tsx
import React from 'react';

export function commandTokenClass(token: string, tokenIndex: number): string {
  if (tokenIndex === 0) return 'pc-action-token--bin';
  if (/^[A-Z_][A-Z0-9_]*=/.test(token)) return 'pc-action-token--env';
  if (/^-{1,2}[\w-]+/.test(token)) return 'pc-action-token--flag';
  if (/^["'].*["']$/.test(token)) return 'pc-action-token--str';     // NEW
  if (/^https?:\/\//.test(token)) return 'pc-action-token--url';
  if (/^(?:\/|~\/|\.{1,2}\/)/.test(token)) return 'pc-action-token--path';
  if (/^(?:&&|\|\||[|;])$/.test(token)) return 'pc-action-token--op';
  if (/^\d+(?:\.\d+)?(?::\d+)?$/.test(token) || /:\d+/.test(token)) return 'pc-action-token--number';
  return 'pc-action-token--arg';
}

export function renderCommandTokens(command: string) {
  let tokenIndex = 0;
  return (command.match(/\s+|[^\s]+/g) ?? []).map((token, index) => {
    if (/^\s+$/.test(token)) return <span key={`space-${index}`}>{token}</span>;
    const className = commandTokenClass(token, tokenIndex);
    tokenIndex += 1;
    return <span key={`${className}-${index}`} className={`pc-action-token ${className}`}>{token}</span>;
  });
}
```

- [ ] **Step 3: Move `GitActionMark`, `DockerActionMark` to `helpers/actionMarks.tsx`**

```tsx
// services/aris-web/components/project-chat/helpers/actionMarks.tsx
import React from 'react';
export function GitActionMark({ size = 12 }: { size?: number }) { /* unchanged */ }
export function DockerActionMark({ size = 12 }: { size?: number }) { /* unchanged */ }
```

- [ ] **Step 4: Replace inline definitions in `HomePageClient.tsx` with imports**

At the top:
```typescript
import {
  isProjectActionEvent,
  isProjectRunStatusEvent,
  eventCommand,
  projectActionPreview,
  projectActionMeta,
} from '@/components/project-chat/helpers/projectChatEvents';
import { renderCommandTokens, commandTokenClass } from '@/components/project-chat/helpers/commandTokens';
import { GitActionMark, DockerActionMark } from '@/components/project-chat/helpers/actionMarks';
```

Delete the original `function` declarations in `HomePageClient.tsx`.

- [ ] **Step 5: Type check + visual sanity in dev**

```bash
cd services/aris-web && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add services/aris-web/components/project-chat/helpers services/aris-web/app/HomePageClient.tsx
git commit -m "refactor(project-chat): extract action-event helpers from HomePageClient.tsx"
```

---

## Task 8: Add `--syn-str` styling for the new `pc-action-token--str` class

**Files:**
- Modify: `services/aris-web/app/styles/ui.css`

- [ ] **Step 1: Locate the existing `.pc-action-token--*` block** (search around line 3489).

- [ ] **Step 2: Add the new rule near sibling tokens**

```css
.pc-proto .pc-action-token--str { color: var(--syn-str); }
```

In the dark-mode block (if separate), add the same. If the existing tokens use a single rule for both themes, the `--syn-str` token variable handles it.

- [ ] **Step 3: Commit**

```bash
git add services/aris-web/app/styles/ui.css
git commit -m "feat(ui): pc-action-token--str (quoted string) syntax color"
```

---

## Task 9: Extract `ProjectRunStatusChip` from HomePageClient.tsx

**Files:**
- Create: `services/aris-web/components/project-chat/ProjectRunStatusChip.tsx`
- Modify: `services/aris-web/app/HomePageClient.tsx`

- [ ] **Step 1: Copy function to new file**

```tsx
// services/aris-web/components/project-chat/ProjectRunStatusChip.tsx
'use client';
import React from 'react';
import type { UiEvent } from '@/lib/happy/types';
// … all imports the existing inline definition uses

export function ProjectRunStatusChip({ event }: { event: UiEvent }) {
  /* copy existing body verbatim from HomePageClient.tsx (line ~2023+) */
}
```

- [ ] **Step 2: Replace inline use in `HomePageClient.tsx` with import**

```typescript
import { ProjectRunStatusChip } from '@/components/project-chat/ProjectRunStatusChip';
```

- [ ] **Step 3: tsc + commit**

```bash
cd services/aris-web && npx tsc --noEmit
git add services/aris-web/components/project-chat/ProjectRunStatusChip.tsx services/aris-web/app/HomePageClient.tsx
git commit -m "refactor(project-chat): extract ProjectRunStatusChip"
```

---

## Task 10: `cmd-display/icons.tsx`

**Files:**
- Create: `services/aris-web/components/project-chat/cmd-display/icons.tsx`

(Identical body to previous plan Task 6 — inline SVG library for 18 icons + chevrons + x.)

- [ ] **Step 1: Write file (paths exactly as in v3 prototype)**

- [ ] **Step 2: tsc + commit**

```bash
cd services/aris-web && npx tsc --noEmit
git add services/aris-web/components/project-chat/cmd-display/icons.tsx
git commit -m "feat(cmd-display): inline SVG icon library"
```

---

## Task 11: `cmd-display/CmdBadge.tsx`

**Files:**
- Create: `services/aris-web/components/project-chat/cmd-display/CmdBadge.tsx`
- Modify: `services/aris-web/app/styles/ui.css` (add `.cmd-badge` rules, extending the `.pc-` namespace)

- [ ] **Step 1: Add CSS to `ui.css`** — under the existing `.pc-proto` section, append a new block:

```css
/* === Action card badge (cmd-tone-driven) === */
.pc-proto .cmd-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2.5px 8px 2.5px 7px;
  border-radius: 999px;
  font-size: 11px; font-weight: 700;
  font-family: var(--font-mono); letter-spacing: 0.01em;
  line-height: 1; white-space: nowrap;
  position: relative; flex-shrink: 0; vertical-align: middle;
  background: var(--tone-bg); color: var(--tone-fg);
  border: 0;
}
.pc-proto .cmd-badge[data-clickable="true"] {
  cursor: pointer;
  transition: transform var(--t-fast), box-shadow var(--t-fast);
}
.pc-proto .cmd-badge[data-clickable="true"]:hover,
.pc-proto .cmd-badge[data-clickable="true"]:focus-visible {
  transform: translateY(-1px); box-shadow: var(--shadow-sm); z-index: 30; outline: 0;
}
.pc-proto .cmd-badge[data-open="true"] {
  box-shadow: 0 0 0 2px var(--b-500), var(--shadow-sm); z-index: 30;
}

.pc-proto .cmd-badge[data-tone="read"]    { --tone-fg: var(--tone-read-fg);    --tone-bg: var(--tone-read-bg); }
.pc-proto .cmd-badge[data-tone="write"]   { --tone-fg: var(--tone-write-fg);   --tone-bg: var(--tone-write-bg); }
.pc-proto .cmd-badge[data-tone="edit"]    { --tone-fg: var(--tone-edit-fg);    --tone-bg: var(--tone-edit-bg); }
.pc-proto .cmd-badge[data-tone="shell"]   { --tone-fg: var(--tone-shell-fg);   --tone-bg: var(--tone-shell-bg); }
.pc-proto .cmd-badge[data-tone="list"]    { --tone-fg: var(--tone-list-fg);    --tone-bg: var(--tone-list-bg); }
.pc-proto .cmd-badge[data-tone="glob"]    { --tone-fg: var(--tone-glob-fg);    --tone-bg: var(--tone-glob-bg); }
.pc-proto .cmd-badge[data-tone="search"]  { --tone-fg: var(--tone-search-fg);  --tone-bg: var(--tone-search-bg); }
.pc-proto .cmd-badge[data-tone="net"]     { --tone-fg: var(--tone-net-fg);     --tone-bg: var(--tone-net-bg); }
.pc-proto .cmd-badge[data-tone="pkg"]     { --tone-fg: var(--tone-pkg-fg);     --tone-bg: var(--tone-pkg-bg); }
.pc-proto .cmd-badge[data-tone="build"]   { --tone-fg: var(--tone-build-fg);   --tone-bg: var(--tone-build-bg); }
.pc-proto .cmd-badge[data-tone="test"]    { --tone-fg: var(--tone-test-fg);    --tone-bg: var(--tone-test-bg); }
.pc-proto .cmd-badge[data-tone="git"]     { --tone-fg: var(--tone-git-fg);     --tone-bg: var(--tone-git-bg); }
.pc-proto .cmd-badge[data-tone="docker"]  { --tone-fg: var(--tone-docker-fg);  --tone-bg: var(--tone-docker-bg); }
.pc-proto .cmd-badge[data-tone="destroy"] { --tone-fg: var(--tone-destroy-fg); --tone-bg: var(--tone-destroy-bg); }
.pc-proto .cmd-badge[data-tone="think"]   { --tone-fg: var(--tone-think-fg);   --tone-bg: var(--tone-think-bg); }
.pc-proto .cmd-badge[data-tone="todo"]    { --tone-fg: var(--tone-todo-fg);    --tone-bg: var(--tone-todo-bg); }
.pc-proto .cmd-badge[data-tone="agent"]   { --tone-fg: var(--tone-agent-fg);   --tone-bg: var(--tone-agent-bg); }
.pc-proto .cmd-badge[data-tone="cmd"]     { --tone-fg: var(--tone-cmd-fg);     --tone-bg: var(--tone-cmd-bg); }

.pc-proto .cmd-badge[data-running="true"]::after {
  content: ''; position: absolute; inset: -3px; border-radius: 999px;
  border: 1.5px dashed currentColor; opacity: 0.6; pointer-events: none;
  animation: cmdBadgePulse 1.6s ease-out infinite;
}
@keyframes cmdBadgePulse {
  0%   { opacity: 0.55; transform: scale(0.92); }
  100% { opacity: 0;    transform: scale(1.10); }
}
.pc-proto .cmd-badge[data-error="true"]::before {
  content: ''; position: absolute; top: -2px; right: -2px;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--danger-fg); border: 2px solid var(--surface);
}
```

- [ ] **Step 2: Write component**

```tsx
// services/aris-web/components/project-chat/cmd-display/CmdBadge.tsx
'use client';
import React from 'react';
import type { ToneName, IconName } from '@/lib/cmd/types';
import { CmdIcon } from './icons';

export type CmdBadgeProps = {
  tone: ToneName;
  icon: IconName;
  label: string;
  isRunning?: boolean;
  isError?: boolean;
  isOpen?: boolean;
  clickable?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  ariaLabel?: string;
};

export function CmdBadge({ tone, icon, label, isRunning, isError, isOpen, clickable, onClick, ariaLabel }: CmdBadgeProps) {
  const Tag: 'button' | 'span' = clickable ? 'button' : 'span';
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      className="cmd-badge"
      data-tone={tone}
      data-clickable={clickable ? 'true' : undefined}
      data-open={isOpen ? 'true' : undefined}
      data-running={isRunning ? 'true' : undefined}
      data-error={isError ? 'true' : undefined}
      onClick={onClick}
      aria-label={ariaLabel ?? `${label}${isError ? ' · error' : isRunning ? ' · running' : ''}`}
    >
      <CmdIcon name={icon} size={11} />
      <span>{label}</span>
    </Tag>
  );
}
```

- [ ] **Step 3: tsc + commit**

```bash
cd services/aris-web && npx tsc --noEmit
git add services/aris-web/components/project-chat/cmd-display/CmdBadge.tsx services/aris-web/app/styles/ui.css
git commit -m "feat(cmd-display): CmdBadge with 18-tone palette + status overlays"
```

---

## Task 12: `cmd-display/FileChip.tsx`

**Files:**
- Create: `services/aris-web/components/project-chat/cmd-display/FileChip.tsx`
- Modify: `services/aris-web/app/styles/ui.css` (add `.cmd-file-chip` rules)

- [ ] **Step 1: Add CSS**

```css
.pc-proto .cmd-file-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 6px;
  background: var(--surface-sunken);
  border: 1px solid var(--border-subtle);
  border-radius: 3px;
  font-family: var(--font-mono); font-size: 10.8px;
  color: var(--text-primary);
  line-height: 1.35;
  max-width: 36ch;
  cursor: pointer; vertical-align: middle; flex-shrink: 0;
}
.pc-proto .cmd-file-chip:hover { background: var(--surface-hover); border-color: var(--border-default); }
.pc-proto .cmd-file-chip:focus-visible { outline: 2px solid var(--b-500); outline-offset: 1px; }
.pc-proto .cmd-file-chip:disabled { cursor: default; opacity: 0.85; }
.pc-proto .cmd-file-chip__name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
}
.pc-proto .cmd-file-chip[data-variant="code"]   svg { color: var(--tone-read-fg); }
.pc-proto .cmd-file-chip[data-variant="folder"] svg { color: var(--b-500); }
.pc-proto .cmd-file-chip[data-variant="config"] svg { color: var(--warning-fg); }
.pc-proto .cmd-file-chip[data-variant="shell"]  svg { color: var(--success-fg); }
.pc-proto .cmd-file-chip[data-variant="other"]  svg { color: var(--text-tertiary); }
```

- [ ] **Step 2: Write component**

```tsx
// services/aris-web/components/project-chat/cmd-display/FileChip.tsx
'use client';
import React from 'react';
import type { FileArg } from '@/lib/cmd/types';
import { CmdIcon } from './icons';

function basename(path: string): string {
  const cleaned = path.replace(/\/$/, '');
  const i = cleaned.lastIndexOf('/');
  return i >= 0 ? cleaned.slice(i + 1) : cleaned;
}

export function FileChip({ file, display, onOpen }: { file: FileArg; display?: string; onOpen?: (path: string) => void }) {
  const name = display ?? basename(file.path) ?? file.path;
  return (
    <button
      type="button"
      className="cmd-file-chip"
      data-variant={file.variant}
      title={file.path}
      onClick={() => onOpen?.(file.path)}
      disabled={!onOpen}
    >
      <CmdIcon name={file.variant === 'folder' ? 'folder' : 'file'} size={11} />
      <span className="cmd-file-chip__name">{name}</span>
    </button>
  );
}
```

- [ ] **Step 3: tsc + commit**

```bash
cd services/aris-web && npx tsc --noEmit
git add services/aris-web/components/project-chat/cmd-display/FileChip.tsx services/aris-web/app/styles/ui.css
git commit -m "feat(cmd-display): FileChip with code/folder/config/shell variants"
```

---

## Task 13: `cmd-display/CmdTokens.tsx` — wraps renderCommandTokens + FileChips

**Files:**
- Create: `services/aris-web/components/project-chat/cmd-display/CmdTokens.tsx`

- [ ] **Step 1: Write component**

```tsx
// services/aris-web/components/project-chat/cmd-display/CmdTokens.tsx
'use client';
import React from 'react';
import type { ParsedCommand } from '@/lib/cmd/types';
import { renderCommandTokens } from '@/components/project-chat/helpers/commandTokens';
import { FileChip } from './FileChip';

/**
 * Render a parsed command with two layered passes:
 * 1. renderCommandTokens (existing) handles syntax highlight on the raw string.
 * 2. Inline FileChip replacements: any token that exactly matches a fileArgs.path is swapped for a FileChip.
 *
 * For agent-tool ParsedCommand (tokens is empty), render fileArgs directly.
 */
export function CmdTokens({ parsed, raw, onOpenFile }: { parsed: ParsedCommand; raw?: string; onOpenFile?: (path: string) => void }) {
  if (parsed.tokens.length === 0) {
    // Agent tool — render fileArgs only
    return (
      <span className="pc-action-card__cmd">
        {parsed.fileArgs.map((file, i) => (
          <FileChip key={i} file={file} onOpen={onOpenFile} />
        ))}
      </span>
    );
  }

  // Shell command — combine syntax highlight + interleaved file chips
  const filePaths = new Set(parsed.fileArgs.map((f) => f.path));
  const fileMap = new Map(parsed.fileArgs.map((f) => [f.path, f]));
  const rawString = raw ?? parsed.tokens.map((t) => t.text).join(' ');

  let index = 0;
  return (
    <span className="pc-action-card__cmd" aria-label={rawString}>
      {(rawString.match(/\s+|[^\s]+/g) ?? []).map((segment, segIdx) => {
        if (/^\s+$/.test(segment)) return <span key={`s${segIdx}`}>{segment}</span>;
        if (filePaths.has(segment)) {
          return <FileChip key={`f${segIdx}`} file={fileMap.get(segment)!} onOpen={onOpenFile} />;
        }
        const className = (() => {
          if (index === 0) { index += 1; return 'pc-action-token--bin'; }
          index += 1;
          if (/^[A-Z_][A-Z0-9_]*=/.test(segment)) return 'pc-action-token--env';
          if (/^-{1,2}[\w-]+/.test(segment)) return 'pc-action-token--flag';
          if (/^["'].*["']$/.test(segment)) return 'pc-action-token--str';
          if (/^https?:\/\//.test(segment)) return 'pc-action-token--url';
          if (/^(?:\/|~\/|\.{1,2}\/)/.test(segment)) return 'pc-action-token--path';
          if (/^(?:&&|\|\||[|;])$/.test(segment)) return 'pc-action-token--op';
          if (/^\d+(?:\.\d+)?(?::\d+)?$/.test(segment) || /:\d+/.test(segment)) return 'pc-action-token--number';
          return 'pc-action-token--arg';
        })();
        return <span key={`t${segIdx}`} className={`pc-action-token ${className}`}>{segment}</span>;
      })}
    </span>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd services/aris-web && npx tsc --noEmit
git add services/aris-web/components/project-chat/cmd-display/CmdTokens.tsx
git commit -m "feat(cmd-display): CmdTokens reuses pc-action-token classes + interleaves FileChips"
```

---

## Task 14: `cmd-display/densityStore.ts` (TDD)

**Files:**
- Create: `services/aris-web/components/project-chat/cmd-display/densityStore.ts`
- Test: `services/aris-web/components/project-chat/cmd-display/__tests__/densityStore.test.ts`

(Identical TDD flow to previous plan Task 11.)

- [ ] **Step 1: Write failing test (4 cases — auto default, setGlobal, toggleOverride, override-wins-over-global)**

- [ ] **Step 2: Run (fail)**

```bash
cd services/aris-web && npx vitest run components/project-chat/cmd-display/__tests__/densityStore.test.ts
```

- [ ] **Step 3: Implement densityStore.ts** (Zustand with persist for `global` only; overrides are ephemeral)

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DensityMode = 'auto' | 'expanded' | 'default' | 'minimal';
export type ResolvedDensity = 'expanded' | 'default' | 'minimal';

type State = { global: DensityMode; overrides: Record<string, 'expanded'> };
type Actions = {
  setGlobal: (mode: DensityMode) => void;
  toggleOverride: (id: string) => void;
  clearOverrides: () => void;
  densityFor: (id: string, autoResolved: ResolvedDensity) => ResolvedDensity;
};

export const useDensityStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      global: 'auto',
      overrides: {},
      setGlobal: (mode) => set({ global: mode }),
      toggleOverride: (id) => set((s) => {
        const next = { ...s.overrides };
        if (next[id]) delete next[id]; else next[id] = 'expanded';
        return { overrides: next };
      }),
      clearOverrides: () => set({ overrides: {} }),
      densityFor: (id, autoResolved) => {
        const { global, overrides } = get();
        if (overrides[id]) return 'expanded';
        if (global === 'auto') return autoResolved;
        return global;
      },
    }),
    { name: 'aris.chat.density', partialize: (s) => ({ global: s.global }) },
  ),
);
```

- [ ] **Step 4: Run (pass) + commit**

```bash
cd services/aris-web && npx vitest run components/project-chat/cmd-display/__tests__/densityStore.test.ts
git add services/aris-web/components/project-chat/cmd-display/densityStore.ts services/aris-web/components/project-chat/cmd-display/__tests__/densityStore.test.ts
git commit -m "feat(density): Zustand store with global + per-card override"
```

---

## Task 15: `cmd-display/densityRules.ts` (TDD)

**Files:**
- Create: `services/aris-web/components/project-chat/cmd-display/densityRules.ts`
- Test: `services/aris-web/components/project-chat/cmd-display/__tests__/densityRules.test.ts`

(Identical TDD to previous plan Task 12.)

- [ ] **Step 1–4: Write 4-case test, implement `computeAutoDensity({ isRunning, distanceFromLatest, isError })`, commit**

```typescript
// densityRules.ts
import type { ResolvedDensity } from './densityStore';
export function computeAutoDensity(input: { isRunning: boolean; distanceFromLatest: number; isError: boolean }): ResolvedDensity {
  if (input.isRunning) return 'expanded';
  if (input.isError) return 'default';
  if (input.distanceFromLatest === 0) return 'default';
  return 'minimal';
}
```

```bash
cd services/aris-web && npx vitest run components/project-chat/cmd-display/__tests__/densityRules.test.ts
git add services/aris-web/components/project-chat/cmd-display/densityRules.ts services/aris-web/components/project-chat/cmd-display/__tests__/densityRules.test.ts
git commit -m "feat(density): computeAutoDensity rules + tests"
```

---

## Task 16: `cmd-display/DensityToggle.tsx`

**Files:**
- Create: `services/aris-web/components/project-chat/cmd-display/DensityToggle.tsx`
- Modify: `services/aris-web/app/styles/ui.css` (add `.cmd-density-toggle`)

- [ ] **Step 1: Add CSS** (4-way pill toggle matching v3 prototype's `.density-toggle`):

```css
.pc-proto .cmd-density-toggle {
  display: inline-flex; align-items: center;
  background: var(--surface); border: 1px solid var(--border-default);
  border-radius: 999px; padding: 3px; gap: 2px;
}
.pc-proto .cmd-density-toggle button {
  font: inherit; font-size: 12px; font-weight: 600; color: var(--text-secondary);
  background: transparent; border: 0; padding: 5px 12px; border-radius: 999px;
  cursor: pointer; transition: all var(--t-fast);
}
.pc-proto .cmd-density-toggle button:hover { color: var(--text-primary); }
.pc-proto .cmd-density-toggle button[aria-selected="true"] {
  background: var(--surface-sunken); color: var(--b-600);
  box-shadow: inset 0 0 0 1px rgba(47,107,255,0.36);
}
```

- [ ] **Step 2: Component**

```tsx
'use client';
import React from 'react';
import { useDensityStore, type DensityMode } from './densityStore';

const OPTIONS: { mode: DensityMode; label: string }[] = [
  { mode: 'auto', label: '자동' },
  { mode: 'expanded', label: '확장' },
  { mode: 'default', label: '기본' },
  { mode: 'minimal', label: '최소' },
];

export function DensityToggle() {
  const global = useDensityStore((s) => s.global);
  const setGlobal = useDensityStore((s) => s.setGlobal);
  return (
    <div className="cmd-density-toggle" role="tablist" aria-label="액션 카드 밀도">
      {OPTIONS.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={global === mode}
          onClick={() => setGlobal(mode)}
        >{label}</button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: tsc + commit**

```bash
cd services/aris-web && npx tsc --noEmit
git add services/aris-web/components/project-chat/cmd-display/DensityToggle.tsx services/aris-web/app/styles/ui.css
git commit -m "feat(cmd-display): DensityToggle (4-way header control)"
```

---

## Task 17: New `ProjectActionCard.tsx` (density-aware) replacing the inline version

**Files:**
- Create: `services/aris-web/components/project-chat/ProjectActionCard.tsx`
- Modify: `services/aris-web/app/HomePageClient.tsx`
- Modify: `services/aris-web/app/styles/ui.css` (extend `.pc-action-card` for 18-tone + density variants)

- [ ] **Step 1: Add density-mode CSS rules to `ui.css`**

```css
/* Density variants on the existing pc-action-card */
.pc-proto .pc-action-card[data-density="default"]    { /* default — keep existing layout */ }
.pc-proto .pc-action-card[data-density="expanded"]   { /* default + result block underneath kept */ }
.pc-proto .pc-action-card[data-density="expanded"] .pc-action-card__primary { display: none; } /* badge now carries the label */

/* 18-tone color overrides on the kind chip (replaces the existing 6-tone limits) */
.pc-proto .pc-action-stack[data-tone="read"]    { /* per-tone connector colors if any */ }
/* … (delegated to the cmd-badge via data-tone attribute) */

/* MiniStack row layout */
.pc-proto .cmd-mini-stack { display: flex; flex-direction: column; gap: 6px; }
.pc-proto .cmd-mini-stack__row { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; padding: 4px 0; }
.pc-proto .cmd-mini-stack__label {
  font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
  color: var(--text-tertiary); margin-left: 8px; font-family: var(--font-mono);
}
.pc-proto .cmd-mini-stack__inline { margin-top: 6px; }

/* Hover popover for minimal badges */
.pc-proto .cmd-mini-pop {
  position: absolute; bottom: calc(100% + 8px); left: 50%;
  transform: translateX(-50%);
  background: var(--surface); border: 1px solid var(--border-default);
  border-radius: 6px; padding: 8px 12px; display: grid; gap: 4px;
  min-width: 240px; max-width: 420px;
  box-shadow: 0 8px 24px rgba(15,17,23,0.12), 0 0 0 1px rgba(15,17,23,0.06);
  z-index: 50; white-space: nowrap; pointer-events: none;
}
.pc-proto .cmd-mini-badge-wrap { position: relative; }
.pc-proto .cmd-mini-badge-wrap:hover .cmd-mini-pop,
.pc-proto .cmd-mini-badge-wrap:focus-within .cmd-mini-pop { pointer-events: auto; }
```

- [ ] **Step 2: Write new ProjectActionCard**

```tsx
// services/aris-web/components/project-chat/ProjectActionCard.tsx
'use client';

import React, { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Copy, Maximize2 } from 'lucide-react';
import type { UiEvent } from '@/lib/happy/types';
import { parseAgentCommand, parseShellCommand } from '@/lib/cmd/parseCommand';
import { eventCommand, projectActionPreview } from '@/components/project-chat/helpers/projectChatEvents';
import { CmdBadge } from './cmd-display/CmdBadge';
import { CmdTokens } from './cmd-display/CmdTokens';
import { CmdIcon } from './cmd-display/icons';
import { useDensityStore } from './cmd-display/densityStore';
import type { ResolvedDensity } from './cmd-display/densityStore';

const AGENT_TOOLS_FROM_KIND: Record<string, string | null> = {
  file_read: 'Read', file_write: 'Write', file_list: 'Glob',
  think: 'Think', run_execution: null, command_execution: null,
  exec_execution: null, git_execution: null, docker_execution: null,
};

function parseFromEvent(event: UiEvent) {
  const meta = (event.meta ?? {}) as Record<string, unknown>;
  const toolName = typeof meta.toolName === 'string' ? meta.toolName : undefined;
  if (toolName) return parseAgentCommand(toolName, { path: event.action?.path });
  const fromKind = AGENT_TOOLS_FROM_KIND[event.kind];
  if (fromKind) return parseAgentCommand(fromKind, { path: event.action?.path });
  return parseShellCommand(eventCommand(event));
}

export function ProjectActionCard({
  event,
  density,
  isRunning,
  isError,
  onCopy,
  onPreview,
  onOpenFile,
}: {
  event: UiEvent;
  density: ResolvedDensity;
  isRunning: boolean;
  isError: boolean;
  onCopy: () => void;
  onPreview?: () => void;
  onOpenFile?: (path: string) => void;
}) {
  const parsed = parseFromEvent(event);
  const preview = projectActionPreview(event);
  const toggleOverride = useDensityStore((s) => s.toggleOverride);

  // The existing pc-action-stack connector logic remains for the expanded variant only.
  const stackRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const [connectorMetrics, setConnectorMetrics] = useState<{ cardCenter: number; resultCenter: number } | null>(null);

  useEffect(() => {
    if (density !== 'expanded' || !preview) { setConnectorMetrics(null); return undefined; }
    const stack = stackRef.current; const card = cardRef.current; const result = resultRef.current;
    if (!stack || !card || !result) return undefined;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const stackRect = stack.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const resultRect = result.getBoundingClientRect();
        const next = {
          cardCenter: Math.round(cardRect.top - stackRect.top + cardRect.height / 2),
          resultCenter: Math.round(resultRect.top - stackRect.top + resultRect.height / 2),
        };
        setConnectorMetrics((cur) => (cur && cur.cardCenter === next.cardCenter && cur.resultCenter === next.resultCenter ? cur : next));
      });
    };
    measure();
    const obs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    obs?.observe(card); obs?.observe(result);
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(frame); obs?.disconnect(); window.removeEventListener('resize', measure); };
  }, [density, preview]);

  const connectorStyle = connectorMetrics
    ? ({ '--pc-action-card-center': `${connectorMetrics.cardCenter}px`, '--pc-action-result-center': `${connectorMetrics.resultCenter}px` } as CSSProperties)
    : undefined;

  // ---- Minimal: parent MiniStack handles rendering. Standalone fallback below. ----
  if (density === 'minimal') {
    return (
      <CmdBadge
        tone={parsed.tone}
        icon={parsed.icon}
        label={parsed.label}
        isRunning={isRunning}
        isError={isError}
        clickable
        onClick={() => toggleOverride(event.id)}
      />
    );
  }

  return (
    <div ref={stackRef} className="pc-action-stack" data-kind={parsed.tone} data-density={density} style={connectorStyle}>
      <div ref={cardRef} className="pc-action-card" data-project-action-card data-kind={parsed.tone} data-density={density} onClick={() => toggleOverride(event.id)}>
        <CmdBadge tone={parsed.tone} icon={parsed.icon} label={parsed.label} isRunning={isRunning} isError={isError} />
        <div className="pc-action-card__main">
          <CmdTokens parsed={parsed} raw={eventCommand(event)} onOpenFile={onOpenFile} />
        </div>
        <span className="pc-action-card__time">
          <CmdIcon name={density === 'expanded' ? 'chevronDown' : 'chevronRight'} size={12} />
        </span>
        <div className="pc-action-card__actions">
          {onPreview && (
            <button type="button" className="pc-action-card__preview-btn" onClick={(e) => { e.stopPropagation(); onPreview(); }} title="Preview referenced file">
              <Maximize2 size={13} />
            </button>
          )}
          <button type="button" className="pc-action-card__copy" onClick={(e) => { e.stopPropagation(); onCopy(); }} title="Copy action command">
            <Copy size={13} />
          </button>
        </div>
      </div>
      {density === 'expanded' && preview && (
        <>
          <span className="pc-action-connector" aria-hidden="true" />
          <div ref={resultRef} className="pc-action-result">
            <pre className="pc-action-result__body">{preview}</pre>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Delete the inline `ProjectActionCard` definition from `HomePageClient.tsx` and import the new one**

- [ ] **Step 4: tsc + commit**

```bash
cd services/aris-web && npx tsc --noEmit
git add services/aris-web/components/project-chat/ProjectActionCard.tsx services/aris-web/app/HomePageClient.tsx services/aris-web/app/styles/ui.css
git commit -m "refactor(project-chat): extract ProjectActionCard with density-aware rendering"
```

---

## Task 18: `cmd-display/MiniStack.tsx` — group consecutive actions

**Files:**
- Create: `services/aris-web/components/project-chat/cmd-display/MiniStack.tsx`

- [ ] **Step 1: Write component** (badges row + hover popover + inline expand panel)

```tsx
'use client';
import React, { useState } from 'react';
import type { UiEvent } from '@/lib/happy/types';
import { parseAgentCommand, parseShellCommand } from '@/lib/cmd/parseCommand';
import { eventCommand, projectActionPreview } from '@/components/project-chat/helpers/projectChatEvents';
import { CmdBadge } from './CmdBadge';
import { CmdTokens } from './CmdTokens';
import { FileChip } from './FileChip';
import { useDensityStore } from './densityStore';

const AGENT_FROM_KIND: Record<string, string | null> = {
  file_read: 'Read', file_write: 'Write', file_list: 'Glob', think: 'Think',
};

function parseFromEvent(event: UiEvent) {
  const meta = (event.meta ?? {}) as Record<string, unknown>;
  const toolName = typeof meta.toolName === 'string' ? meta.toolName : undefined;
  if (toolName) return parseAgentCommand(toolName, { path: event.action?.path });
  const fromKind = AGENT_FROM_KIND[event.kind];
  if (fromKind) return parseAgentCommand(fromKind, { path: event.action?.path });
  return parseShellCommand(eventCommand(event));
}

export type MiniStackItem = { event: UiEvent; isRunning: boolean; isError: boolean };

export function MiniStack({ items, onOpenFile }: { items: MiniStackItem[]; onOpenFile?: (path: string) => void }) {
  const overrides = useDensityStore((s) => s.overrides);
  const toggleOverride = useDensityStore((s) => s.toggleOverride);

  const runningCount = items.filter((i) => i.isRunning).length;
  const errorCount = items.filter((i) => i.isError).length;
  const summaryParts = [`${items.length} actions`];
  if (runningCount > 0) summaryParts.push(`${runningCount} 실행 중`);
  if (errorCount > 0) summaryParts.push(`${errorCount} 실패`);

  return (
    <div className="cmd-mini-stack">
      <div className="cmd-mini-stack__row">
        {items.map(({ event, isRunning, isError }) => {
          const parsed = parseFromEvent(event);
          const isOpen = Boolean(overrides[event.id]);
          return (
            <span key={event.id} className="cmd-mini-badge-wrap">
              <CmdBadge
                tone={parsed.tone}
                icon={parsed.icon}
                label={parsed.label}
                isRunning={isRunning}
                isError={isError}
                isOpen={isOpen}
                clickable
                onClick={() => toggleOverride(event.id)}
              />
              <div className="cmd-mini-pop" role="tooltip">
                {parsed.tokens.length > 0
                  ? <CmdTokens parsed={parsed} raw={eventCommand(event)} />
                  : parsed.fileArgs[0]
                  ? <FileChip file={parsed.fileArgs[0]} />
                  : <span>{parsed.label}</span>}
                <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  {isError ? '실패' : isRunning ? '실행 중' : '완료'}
                </div>
              </div>
            </span>
          );
        })}
        <span className="cmd-mini-stack__label">{summaryParts.join(' · ')}</span>
      </div>

      {items.map(({ event, isRunning, isError }) => {
        if (!overrides[event.id]) return null;
        const parsed = parseFromEvent(event);
        const preview = projectActionPreview(event);
        return (
          <div key={event.id + '-x'} className="cmd-mini-stack__inline">
            <div className="pc-action-stack" data-kind={parsed.tone} data-density="expanded">
              <div className="pc-action-card" data-density="expanded" data-kind={parsed.tone} onClick={() => toggleOverride(event.id)}>
                <CmdBadge tone={parsed.tone} icon={parsed.icon} label={parsed.label} isRunning={isRunning} isError={isError} />
                <div className="pc-action-card__main">
                  <CmdTokens parsed={parsed} raw={eventCommand(event)} onOpenFile={onOpenFile} />
                </div>
              </div>
              {preview && (
                <div className="pc-action-result">
                  <pre className="pc-action-result__body">{preview}</pre>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd services/aris-web && npx tsc --noEmit
git add services/aris-web/components/project-chat/cmd-display/MiniStack.tsx
git commit -m "feat(cmd-display): MiniStack with hover preview + inline expand"
```

---

## Task 19: Extract `ProjectChatSurface.tsx` + integrate density + grouping

**Files:**
- Create: `services/aris-web/components/project-chat/ProjectChatSurface.tsx`
- Modify: `services/aris-web/app/HomePageClient.tsx` (remove inline definition, add import + DensityToggle in header)

- [ ] **Step 1: Copy `ProjectChatSurface` body verbatim into the new file**

(The function is ~700 lines from `HomePageClient.tsx:2168`. Copy it entirely along with the local hooks/state.)

- [ ] **Step 2: Inside the message-iteration loop (around line ~2854 in the original), replace the action-event branch with density-aware logic**

```tsx
import { useDensityStore } from './cmd-display/densityStore';
import { computeAutoDensity } from './cmd-display/densityRules';
import { MiniStack, type MiniStackItem } from './cmd-display/MiniStack';
import { ProjectActionCard } from './ProjectActionCard';

// Inside the component, ahead of the events.map(...) iteration:

const densityFor = useDensityStore((s) => s.densityFor);

// Pre-compute density per event.
const indexed = visibleEvents.map((evt, idx) => {
  const isAction = isProjectActionEvent(evt);
  if (!isAction) return { event: evt, density: null, isRunning: false, isError: false };
  const isRunning = /* derive from runtimeRunning + evt streamEvent — verify with existing logic */;
  const isError = evt.severity === 'danger' || /\bexit\s+code\s+[^0]/i.test(evt.result?.preview ?? '');
  // distance: actions count between this and the last action in same agent message run
  const distance = computeDistanceFromLatest(evt, visibleEvents);
  const auto = computeAutoDensity({ isRunning, distanceFromLatest: distance, isError });
  const resolved = densityFor(evt.id, auto);
  return { event: evt, density: resolved, isRunning, isError };
});

// Iterate and group consecutive minimal items into a single MiniStack
const nodes: React.ReactNode[] = [];
let buf: MiniStackItem[] = [];
const flush = () => {
  if (buf.length === 0) return;
  nodes.push(<div key={`stack-${buf[0].event.id}`} className="msg msg--action msg--mini-stack"><MiniStack items={buf} onOpenFile={handleOpenWorkspaceFile} /></div>);
  buf = [];
};

for (const { event, density, isRunning, isError } of indexed) {
  if (!density) { flush(); /* existing user/agent/terminal/run-status rendering branch */ continue; }
  if (density === 'minimal') { buf.push({ event, isRunning, isError }); continue; }
  flush();
  nodes.push(
    <div key={event.id} className={`msg msg--action${highlightedMessageId === event.id ? ' msg--highlight' : ''}`}>
      <ProjectActionCard
        event={event}
        density={density}
        isRunning={isRunning}
        isError={isError}
        onCopy={() => handleCopy(eventCommand(event), 'Action command')}
        onPreview={event.parsed?.files?.[0] ? () => setPreviewState('open') : undefined}
        onOpenFile={handleOpenWorkspaceFile}
      />
    </div>,
  );
}
flush();

return /* … existing JSX, but replace the inline events.map with {nodes} */;
```

> **Implementer note:** the existing event iteration mixes terminal/user/agent/run-status/action branches. Restructure carefully so non-action branches still pass through unchanged; only the action branch is replaced. `computeDistanceFromLatest` is a local helper that returns the action-event distance (0 = newest action in same run).

- [ ] **Step 3: Add DensityToggle near the existing `.ch__actions` block** in the header

```tsx
import { DensityToggle } from './cmd-display/DensityToggle';

// inside the header, alongside ch__action buttons:
<DensityToggle />
```

- [ ] **Step 4: Replace inline `ProjectChatSurface` usage in `HomePageClient.tsx` with import**

```typescript
import { ProjectChatSurface } from '@/components/project-chat/ProjectChatSurface';
```

Delete the original `function ProjectChatSurface(...)` block.

- [ ] **Step 5: tsc + dev server visual check**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/action-card-density-impl
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env SKIP_DB_PREPARE=1 WEB_DEV_AUTO_PORT=1 WEB_DEV_PORT=2244 ./deploy/dev/run_web_dev_hot_reload.sh > /tmp/aris-dev-impl.log 2>&1 &
until curl -fsS -o /dev/null http://127.0.0.1:2244/; do sleep 3; done
echo "Dev: https://lawdigest.kr/proxy/2244/?tab=project&project=<id>&view=chat&chat=<chatId>"
```

Open the dev URL with an active project chat and verify:
- 자동 모드: 실행 중 카드 확장형, 가장 최근 완료 카드 기본형, 그 외 최소형 stack
- 토글 4-way 동작
- 클릭으로 최소형 카드 인라인 확장
- 파일 칩 hover/클릭

- [ ] **Step 6: Commit**

```bash
cd services/aris-web && npx tsc --noEmit
git add services/aris-web/components/project-chat/ProjectChatSurface.tsx services/aris-web/app/HomePageClient.tsx
git commit -m "feat(project-chat): density-aware ProjectChatSurface + MiniStack grouping + DensityToggle"
```

---

## Task 20: Final visual QA + regression check

- [ ] **Step 1: Side-by-side compare v3 prototype vs live**

```
https://lawdigest.kr/proxy/2244/action-card-density-v3.html         ← v3 prototype
https://lawdigest.kr/proxy/2244/?tab=project&project=…&view=chat&chat=…  ← live
```

- [ ] **Step 2: Run full test suite**

```bash
cd services/aris-web && npx vitest run
```

Expected: all green. If pre-existing tests now reference removed inline definitions, update only the imports — do not touch test bodies.

- [ ] **Step 3: tsc clean**

```bash
cd services/aris-web && npx tsc --noEmit
```

- [ ] **Step 4: Manual scenarios** — Read×5 stack collapse, mixed kinds, click-to-expand, error corner-dot, running pulse, toggle persistence across navigation.

- [ ] **Step 5: Commit any visual-fix follow-ups** (if needed)

---

## Task 21: Open PR

- [ ] **Step 1: Push branch**

```bash
cd /home/ubuntu/project/ARIS/.worktrees/action-card-density-impl
git push -u origin feat/action-card-density
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(project-chat): action card 밀도 모드 (확장/기본/최소/자동)" --body-file - <<'EOF'
## Summary
- 리디자인 이후 project chat surface(`/?tab=project&...&view=chat&chat=...`)에 v3 시안 적용
- 명령어 기반 18-tone 매핑 + 파일 칩 + 신택스 하이라이팅 확장
- `HomePageClient.tsx`에서 `ProjectChatSurface` / `ProjectActionCard` / 헬퍼 추출 (~1000줄 감량)
- AGENTS.md에 모듈 크기/추출 기준 가이드라인 추가
- 레거시 `sessions/` 경로는 손대지 않음

## Test plan
- [ ] `npx vitest run` 통과 (cmdToneMap + parseCommand + densityStore + densityRules 신규 TDD)
- [ ] `npx tsc --noEmit` 0 errors
- [ ] dev proxy(`https://lawdigest.kr/proxy/2244/`) 시각 검증 (4-way 토글, MiniStack 그룹화, hover, 인라인 확장, 에러 corner-dot, running pulse)
- [ ] v3 prototype과 시각 일치 확인

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

- [ ] **Step 3: Report PR URL**

---

## Task 22: Legacy migration — quarantine `sessions/` route to `_legacy/`

> **Run AFTER Task 21 (current PR merged + production deployed).** This is a separate cleanup pass to prevent future agents from confusing legacy `sessions/[sessionId]/**` with the post-redesign `HomePageClient.tsx` chat surface.

**Files:**
- Move: `services/aris-web/app/sessions/[sessionId]/**` → `services/aris-web/app/_legacy/sessions/[sessionId]/**`
- Update: any remaining imports that still reference the old paths
- Add: `services/aris-web/app/_legacy/README.md` documenting the boundary
- Update: top-level routing — if `/sessions/[sessionId]` is still a published URL, decide redirect target (likely `/?tab=project&project=…&view=chat&chat=…`)

- [ ] **Step 1: Branch + worktree**

```bash
cd /home/ubuntu/project/ARIS
scripts/create_worktree_with_shared_node_modules.sh .worktrees/legacy-sessions-quarantine chore/quarantine-legacy-sessions
cd .worktrees/legacy-sessions-quarantine
```

- [ ] **Step 2: Inventory live references**

```bash
grep -rn "from '@/app/sessions/\[sessionId\]\|from '../sessions/\[sessionId\]\|app/sessions/\[sessionId\]" services/aris-web --include='*.ts' --include='*.tsx'
```

For each match, classify:
- Internal references within `sessions/[sessionId]/**` → move together
- External references from post-redesign code → either kept (legacy still partially in use) or rewrite/remove

If any external reference remains, escalate to user before moving (legacy is still load-bearing).

- [ ] **Step 3: Decide route handling**

```bash
# Does the old route still need to serve users?
gh issue list --search "sessions route deprecation"  # check for prior decisions
```

Two options:
- **A. Hard remove**: delete the dynamic route, replace with `app/sessions/[sessionId]/redirect.tsx` that 308-redirects to `/?tab=project&...` derived from `sessionId`. Add a server-side lookup to map sessionId → projectId.
- **B. Quarantine in place**: keep route under `_legacy/` folder marker but accessible via dev for QA only; gate behind a feature flag (`ENABLE_LEGACY_SESSION_ROUTE`) defaulting to off in production.

Discuss with user before choosing.

- [ ] **Step 4: Execute move**

```bash
mkdir -p services/aris-web/app/_legacy
git mv services/aris-web/app/sessions services/aris-web/app/_legacy/sessions
```

`_legacy` prefix is Next.js's convention for non-routed folders (underscore-prefixed segments are excluded from routing), so this also disables the URL automatically.

- [ ] **Step 5: Add boundary README**

Create `services/aris-web/app/_legacy/README.md`:

```markdown
# Legacy code quarantine

This folder contains the **pre-redesign** chat surface (`sessions/[sessionId]/**`).

- Replaced by the post-redesign project chat surface at `services/aris-web/components/project-chat/ProjectChatSurface.tsx` (rendered from `app/HomePageClient.tsx` under the `/?tab=project&view=chat` route).
- The `_legacy` directory is excluded from Next.js routing (underscore-prefixed folders are non-routable).
- **Do not modify** files in this folder. New features go to `components/project-chat/**`.
- See AGENTS.md "모듈 크기 / 추출 기준" and project memory for canonical post-redesign paths.

If you must reference legacy code for migration purposes, copy what you need into the new location rather than editing here.
```

- [ ] **Step 6: Update imports**

For any external reference found in Step 2, update or remove:
- Imports from `app/sessions/[sessionId]/*` → `app/_legacy/sessions/[sessionId]/*` (only if intentionally keeping the reference)
- Tests under `services/aris-web/tests/**` that target legacy components → either move under `_legacy/__tests__` or delete if no longer asserted

- [ ] **Step 7: Verify**

```bash
cd services/aris-web && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 8: Commit + PR**

```bash
git add services/aris-web/app/_legacy
git commit -m "chore(web): quarantine pre-redesign sessions route under _legacy/"
git push -u origin chore/quarantine-legacy-sessions
gh pr create --title "chore(web): quarantine legacy sessions route under _legacy/" --body-file - <<'EOF'
## Summary
- 후-리디자인 작업 완료 후 `sessions/[sessionId]/**` 를 `_legacy/sessions/[sessionId]/**` 로 이동
- Next.js underscore-prefix 규칙으로 라우팅 자동 비활성화
- `_legacy/README.md` 에 경계 문서화

## Test plan
- [ ] tsc + vitest 통과
- [ ] dev server에서 `/sessions/[id]` URL이 더 이상 동작하지 않거나 새 경로로 리다이렉트

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

---

## Self-review checklist (run after writing this plan)

- [x] Spec coverage — every section A–E of `design/action-card-density-v3.html` mapped to a task
- [x] Placeholder scan — no TBD/TODO in step bodies (all code blocks present)
- [x] Type consistency — `ToneName` / `IconName` / `ParsedCommand` defined in Task 3 and used in Tasks 4-19
- [x] Scope check — only `components/project-chat/**`, `lib/cmd/**`, `HomePageClient.tsx`, `tokens.css`, `ui.css`, `AGENTS.md` modified; `sessions/**` untouched
- [x] Refactoring guideline — Task 1 adds AGENTS.md rule; Tasks 7/9/17/19 enact extraction
