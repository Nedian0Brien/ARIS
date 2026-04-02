import { describe, expect, it } from 'vitest';
import { extractLastDirectoryName, resolveAgentFlavor } from '@/lib/happy/utils';

describe('extractLastDirectoryName', () => {
  it('returns last segment of a path', () => {
    expect(extractLastDirectoryName('/workspace/my-project')).toBe('my-project');
  });

  it('returns last segment ignoring trailing slash', () => {
    expect(extractLastDirectoryName('/workspace/my-project/')).toBe('my-project');
  });

  it('returns / for root path', () => {
    expect(extractLastDirectoryName('/')).toBe('/');
  });

  it('returns fallback for empty string', () => {
    expect(extractLastDirectoryName('')).toBe('workspace');
  });

  it('handles windows-style backslash paths', () => {
    expect(extractLastDirectoryName('C:\\Users\\foo\\bar')).toBe('bar');
  });
});

describe('resolveAgentFlavor', () => {
  it('returns claude for claude', () => {
    expect(resolveAgentFlavor('claude')).toBe('claude');
  });

  it('returns codex for codex', () => {
    expect(resolveAgentFlavor('codex')).toBe('codex');
  });

  it('returns gemini for gemini', () => {
    expect(resolveAgentFlavor('gemini')).toBe('gemini');
  });

  it('returns unknown for unrecognized string', () => {
    expect(resolveAgentFlavor('gpt-4')).toBe('unknown');
  });

  it('returns unknown for null', () => {
    expect(resolveAgentFlavor(null)).toBe('unknown');
  });

  it('returns unknown for undefined', () => {
    expect(resolveAgentFlavor(undefined)).toBe('unknown');
  });
});
