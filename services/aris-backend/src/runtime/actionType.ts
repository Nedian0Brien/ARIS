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
  /\b(?:echo|printf)\b[\s\S]*>>?/,
  /(?:^|[\s;|&()])(?:\d+)?>>?(?=\S)/,
];

const FILE_READ_PATTERNS: RegExp[] = [
  /(^|[\s'"])cat\s+/,
  /(^|[\s'"])sed\s+/,
  /(^|[\s'"])head\s+/,
  /(^|[\s'"])tail\s+/,
];

function unwrapShellCommand(raw: string): string {
  let current = raw.trim();
  if (current.startsWith('$ ')) {
    current = current.slice(2).trim();
  }

  const wrappers = [/^(?:\/bin\/)?bash\s+-lc\s+(.+)$/i, /^(?:\/bin\/)?sh\s+-lc\s+(.+)$/i];
  for (const wrapper of wrappers) {
    const match = current.match(wrapper);
    if (!match) {
      continue;
    }
    const inner = match[1]?.trim() ?? '';
    if (
      (inner.startsWith('"') && inner.endsWith('"'))
      || (inner.startsWith("'") && inner.endsWith("'"))
    ) {
      current = inner.slice(1, -1).trim();
    } else {
      current = inner;
    }
  }

  return current;
}

function stripQuotedSegments(input: string): string {
  let result = '';
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (escaped) {
      result += quote ? ' ' : char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      result += quote ? ' ' : char;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      }
      result += ' ';
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char as "'" | '"' | '`';
      result += ' ';
      continue;
    }

    result += char;
  }

  return result;
}

export function inferActionTypeFromCommand(command: string): ActionType {
  const normalized = unwrapShellCommand(command).toLowerCase();
  const unquoted = stripQuotedSegments(normalized);

  if (FILE_LIST_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'file_list';
  }

  // Evaluate write intent before read intent to prevent mixed commands
  // like "sed -n ... && mkdir -p ... && cat > file" from being mislabeled.
  if (FILE_WRITE_PATTERNS.some((pattern) => pattern.test(unquoted))) {
    return 'file_write';
  }

  if (FILE_READ_PATTERNS.some((pattern) => pattern.test(unquoted))) {
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
