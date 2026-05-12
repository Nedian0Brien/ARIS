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
