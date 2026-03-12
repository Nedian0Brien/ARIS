import { describe, expect, it } from 'vitest';
import {
  GEMINI_PERMISSION_CAPABILITY,
  extractGeminiPermissionRequest,
} from '../src/runtime/providers/gemini/geminiPermissionBridge.js';

describe('geminiPermissionBridge', () => {
  it('currently documents Gemini permission capability as unsupported', () => {
    expect(GEMINI_PERMISSION_CAPABILITY.supported).toBe(false);
    expect(GEMINI_PERMISSION_CAPABILITY.evidence).toContain('No permission');
  });

  it('does not extract permission requests from current Gemini traces', () => {
    const line = JSON.stringify({
      type: 'tool',
      subtype: 'command_execution',
      command: 'pwd',
      output: '/workspace',
    });

    expect(extractGeminiPermissionRequest(line)).toBeNull();
  });
});
