export const MOBILE_OVERFLOW_PREFLIGHT_RETRY_ATTEMPTS = 12;
export const MOBILE_OVERFLOW_PREFLIGHT_TIMEOUT_MS = 5_000;
export const MOBILE_OVERFLOW_PREFLIGHT_DELAY_MS = 2_000;

export function isIgnorableMobileOverflowScreenshotError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();

  return normalized.includes('page.screenshot')
    && normalized.includes('fonts to load');
}

export function shouldRetryMobileOverflowPreflight(input) {
  const status = typeof input?.status === 'number' ? input.status : null;
  const detail = String(input?.detail ?? '').toLowerCase();

  if (detail.includes('aborted due to timeout') || detail.includes('timed out')) {
    return true;
  }

  if (detail.includes('fetch failed') || detail.includes('econnrefused')) {
    return true;
  }

  if (status !== null && status >= 500) {
    return true;
  }

  return detail.startsWith('<!doctype')
    || detail.includes('compiling')
    || detail.includes('building');
}
