import { describe, expect, it } from 'vitest';
import {
  looksLikeShellTranscript,
  shouldShowDebugToggleInHeader,
} from '@/app/sessions/[sessionId]/chatDebugMode';

describe('chatDebugMode helpers', () => {
  it('shows the debug toggle in the header only when the header is wide enough', () => {
    expect(shouldShowDebugToggleInHeader(0, false)).toBe(false);
    expect(shouldShowDebugToggleInHeader(1199, false)).toBe(false);
    expect(shouldShowDebugToggleInHeader(1200, false)).toBe(true);
    expect(shouldShowDebugToggleInHeader(1600, true)).toBe(false);
  });

  it('detects shell transcript style bodies', () => {
    expect(looksLikeShellTranscript('$ ls -la\nfile.txt\nexit code: 0')).toBe(true);
    expect(looksLikeShellTranscript('일반적인 요약 문장입니다.')).toBe(false);
  });
});
