import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  MOBILE_OVERFLOW_PREFLIGHT_DELAY_MS,
  MOBILE_OVERFLOW_PREFLIGHT_RETRY_ATTEMPTS,
  MOBILE_OVERFLOW_PREFLIGHT_TIMEOUT_MS,
  shouldRetryMobileOverflowPreflight,
} from '../tests/e2e/mobileOverflowSupport.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webRoot = resolve(__dirname, '..');
const repoRoot = resolve(webRoot, '..', '..');

const DEFAULT_BASE_PORT = process.env.WEB_DEV_PORT?.trim() || '3305';
const defaultBaseUrl = `http://127.0.0.1:${DEFAULT_BASE_PORT}`;

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, 'utf8');
  const entries = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }

  return entries;
}

function firstDefined(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

async function assertServerHealthy(baseUrl) {
  let lastDetail = 'unknown';
  let lastStatus = null;

  for (let attempt = 1; attempt <= MOBILE_OVERFLOW_PREFLIGHT_RETRY_ATTEMPTS; attempt += 1) {
    const timeout = AbortSignal.timeout(MOBILE_OVERFLOW_PREFLIGHT_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}/login`, {
        redirect: 'manual',
        signal: timeout,
      });

      if (response.ok) {
        return;
      }

      lastStatus = response.status;
      lastDetail = await response.text();
      if (
        attempt < MOBILE_OVERFLOW_PREFLIGHT_RETRY_ATTEMPTS
        && shouldRetryMobileOverflowPreflight({ status: response.status, detail: lastDetail })
      ) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, MOBILE_OVERFLOW_PREFLIGHT_DELAY_MS));
        continue;
      }

      throw new Error(
        `mobile-overflow E2E preflight failed: ${baseUrl}/login returned HTTP ${response.status}. `
        + 'This usually means the selected dev server is stale or serving the wrong app.',
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      lastDetail = detail;

      if (
        attempt < MOBILE_OVERFLOW_PREFLIGHT_RETRY_ATTEMPTS
        && shouldRetryMobileOverflowPreflight({ status: lastStatus ?? undefined, detail })
      ) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, MOBILE_OVERFLOW_PREFLIGHT_DELAY_MS));
        continue;
      }

      throw new Error(
        `mobile-overflow E2E preflight failed: ${baseUrl}/login is unreachable (${detail}). `
        + 'Start a dev server for this worktree and/or set MOBILE_OVERFLOW_BASE_URL explicitly.',
      );
    }
  }

  throw new Error(
    `mobile-overflow E2E preflight failed: ${baseUrl}/login did not become ready`
    + ` after ${MOBILE_OVERFLOW_PREFLIGHT_RETRY_ATTEMPTS} attempts`
    + ` (status=${lastStatus ?? 'n/a'}, detail=${lastDetail.slice(0, 180)}).`,
  );
}

async function main() {
  const localEnv = parseEnvFile(resolve(webRoot, '.env'));
  const deployEnvPath = firstDefined(
    process.env.DEPLOY_ENV_FILE,
    '/home/ubuntu/.config/aris/prod.env',
  );
  const deployEnv = deployEnvPath ? parseEnvFile(deployEnvPath) : {};

  const mobileEmail = firstDefined(
    process.env.MOBILE_OVERFLOW_EMAIL,
    process.env.ARIS_ADMIN_EMAIL,
    localEnv.MOBILE_OVERFLOW_EMAIL,
    localEnv.ARIS_ADMIN_EMAIL,
    deployEnv.MOBILE_OVERFLOW_EMAIL,
    deployEnv.ARIS_ADMIN_EMAIL,
  );
  const mobilePassword = firstDefined(
    process.env.MOBILE_OVERFLOW_PASSWORD,
    process.env.ARIS_ADMIN_PASSWORD,
    localEnv.MOBILE_OVERFLOW_PASSWORD,
    localEnv.ARIS_ADMIN_PASSWORD,
    deployEnv.MOBILE_OVERFLOW_PASSWORD,
    deployEnv.ARIS_ADMIN_PASSWORD,
  );
  const baseUrl = firstDefined(
    process.env.MOBILE_OVERFLOW_BASE_URL,
    process.env.APP_BASE_URL && process.env.NODE_ENV === 'production' ? process.env.APP_BASE_URL : undefined,
    defaultBaseUrl,
  );

  if (!mobileEmail || !mobilePassword) {
    throw new Error(
      'mobile-overflow E2E requires credentials. Set MOBILE_OVERFLOW_EMAIL/MOBILE_OVERFLOW_PASSWORD '
      + 'or provide ARIS_ADMIN_EMAIL/ARIS_ADMIN_PASSWORD in the environment or env files.',
    );
  }

  await assertServerHealthy(baseUrl);

  const runnerEnv = {
    ...process.env,
    MOBILE_OVERFLOW_EMAIL: mobileEmail,
    MOBILE_OVERFLOW_PASSWORD: mobilePassword,
    MOBILE_OVERFLOW_BASE_URL: baseUrl,
  };

  const playwrightBin = resolve(webRoot, 'node_modules', '.bin', 'playwright');
  const child = spawn(
    playwrightBin,
    ['test', 'tests/e2e/mobile-overflow.spec.ts', '--config=playwright.config.ts'],
    {
      cwd: webRoot,
      stdio: 'inherit',
      env: runnerEnv,
    },
  );

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  console.error(
    `Hint: run DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env SKIP_DB_PREPARE=1 WEB_DEV_PORT=3315 `
    + `${resolve(repoRoot, 'deploy', 'dev', 'run_web_dev_hot_reload.sh')} and retry with `
    + 'MOBILE_OVERFLOW_BASE_URL=http://127.0.0.1:3315 if you are testing from a worktree.',
  );
  process.exit(1);
});
