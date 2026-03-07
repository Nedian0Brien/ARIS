export type ActionType = 'command_execution' | 'file_list' | 'file_read' | 'file_write';

const FILE_LIST_PATTERNS: RegExp[] = [
  /\brg\s+--files\b/,
  /(^|[\s'"])ls\s+/,
  /(^|[\s'"])find\s+/,
  /(^|[\s'"])tree\s+/,
];

const FILE_WRITE_PATTERNS: RegExp[] = [
  /\bapply_patch\b/,
  /\btee\b/,
  /\bsed\s+-i\b/,
  /\bperl\s+-pi\b/,
  /\bmkdir\b/,
  /\btouch\b/,
  /\bmv\b/,
  /\bcp\b/,
  /\brm\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\btruncate\b/,
  /\binstall\b/,
  /\bcat\b[\s\S]*>>?/,
  /\s>>\s?/,
  /\s>\s/,
];

const FILE_READ_PATTERNS: RegExp[] = [
  /(^|[\s'"])cat\s+/,
  /(^|[\s'"])sed\s+/,
  /(^|[\s'"])head\s+/,
  /(^|[\s'"])tail\s+/,
];

export function inferActionTypeFromCommand(command: string): ActionType {
  const normalized = command.toLowerCase();

  if (FILE_LIST_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'file_list';
  }

  // Evaluate write intent before read intent to prevent mixed commands
  // like "sed -n ... && mkdir -p ... && cat > file" from being mislabeled.
  if (FILE_WRITE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'file_write';
  }

  if (FILE_READ_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'file_read';
  }

  return 'command_execution';
}

export function titleForActionType(actionType: ActionType): string {
  if (actionType === 'file_list') {
    return 'File Listing';
  }
  if (actionType === 'file_read') {
    return 'File Read';
  }
  if (actionType === 'file_write') {
    return 'File Write';
  }
  return 'Command Execution';
}
