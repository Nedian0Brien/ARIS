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
  it('skips sudo/cd/time/env/rtk prefixes', () => {
    expect(parseShellCommand('sudo rm -rf /tmp/x').head).toBe('rm');
    expect(parseShellCommand('cd services/aris-web && npm test').head).toBe('npm');
    expect(parseShellCommand('time npm test').head).toBe('npm');
    expect(parseShellCommand('env NODE_ENV=prod npm start').head).toBe('npm');
    // rtk (Rust Token Killer) is a Claude Code hook wrapper; transparent to user intent.
    expect(parseShellCommand('rtk git status').head).toBe('git');
    expect(parseShellCommand('rtk npm test -- foo').tone).toBe('pkg');
    expect(parseShellCommand('rtk cat services/aris-web/middleware.ts').tone).toBe('read');
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
  it('strips a leading wrap quote when followed by an identifier', () => {
    const wrapped = `'docker exec foo -c '"'{"batch":5}'"' bar`;
    const p = parseShellCommand(wrapped);
    expect(p.head).toBe('docker');
    expect(p.tone).toBe('docker');
  });
  it('keeps a leading quote when followed by a non-identifier (legitimate quoted-arg)', () => {
    expect(parseShellCommand(`'{"key":"val"}'`).tone).toBe('cmd');
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
