import type { ProviderPermissionRequest } from '../../contracts/providerRuntime.js';

export const GEMINI_PERMISSION_CAPABILITY = {
  supported: false,
  evidence: 'No permission or approval event traces have been observed in the current Gemini fixtures.',
} as const;

export function extractGeminiPermissionRequest(_line: string): ProviderPermissionRequest | null {
  return null;
}
