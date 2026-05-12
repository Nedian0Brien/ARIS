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
  // Find head from first segment that has a meaningful command after stripping prefixes
  let head = '';
  let pipedCount = 0;
  for (const seg of segments) {
    const rawFirstTokens = stripPrefixes(tokenizeRaw(seg));
    const candidate = rawFirstTokens[0] ?? '';
    if (candidate) {
      head = candidate;
      pipedCount = rawFirstTokens.filter((t) => t === '|').length;
      break;
    }
  }

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
