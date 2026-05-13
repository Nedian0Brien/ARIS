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
