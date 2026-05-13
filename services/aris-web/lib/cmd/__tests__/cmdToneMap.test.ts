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
