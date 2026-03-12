const fs = require('fs');
const path = require('path');

const DEFAULT_DEPLOY_ENV_FILE = '/home/ubuntu/.config/aris/prod.env';

function readEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) {
    return '';
  }

  const rawLines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx < 0) {
      continue;
    }

    const currentKey = trimmed.slice(0, idx).trim();
    let currentValue = trimmed.slice(idx + 1).trim();
    if (currentKey !== key) {
      continue;
    }

    if (
      (currentValue.startsWith('"') && currentValue.endsWith('"')) ||
      (currentValue.startsWith("'") && currentValue.endsWith("'"))
    ) {
      currentValue = currentValue.slice(1, -1);
    }

    return currentValue;
  }

  return '';
}

function resolveEnvValue(key, defaultValue = '') {
  const explicitDeployEnv = process.env.DEPLOY_ENV_FILE || DEFAULT_DEPLOY_ENV_FILE;
  const sharedRepoRoot = process.env.ARIS_SHARED_REPO_ROOT || '';
  const envFiles = [
    explicitDeployEnv,
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', 'services', 'aris-backend', '.env'),
    sharedRepoRoot ? path.join(sharedRepoRoot, 'services', 'aris-backend', '.env') : '',
    path.join(process.cwd(), 'deploy', '.env'),
    path.join(process.cwd(), 'services', 'aris-backend', '.env'),
  ];

  for (const envFile of envFiles) {
    if (!envFile) {
      continue;
    }
    const value = readEnvValue(envFile, key);
    if (value) {
      return value;
    }
  }

  return defaultValue;
}

function resolveRuntimeToken() {
  return resolveEnvValue('RUNTIME_API_TOKEN', 'change-this-runtime-token');
}

function resolvePm2BackendCwd() {
  return process.env.ARIS_BACKEND_PM2_CWD || './services/aris-backend';
}

function resolvePm2BackendScript() {
  return process.env.ARIS_BACKEND_PM2_SCRIPT || './dist/index.js';
}

function resolveBackendInstances() {
  const raw = resolveEnvValue('ARIS_BACKEND_INSTANCES', '1');
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return value;
}

module.exports = {
  apps: [
    {
      name: 'aris-backend',
      script: resolvePm2BackendScript(),
      cwd: resolvePm2BackendCwd(),
      exec_mode: 'cluster',
      instances: resolveBackendInstances(),
      listen_timeout: 10000,
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 4080,
        RUNTIME_API_TOKEN: resolveRuntimeToken(),
        RUNTIME_BACKEND: resolveEnvValue('RUNTIME_BACKEND', 'mock'),
        HAPPY_SERVER_URL: resolveEnvValue('HAPPY_SERVER_URL', 'http://127.0.0.1:4080'),
        HAPPY_SERVER_TOKEN: resolveEnvValue('HAPPY_SERVER_TOKEN', ''),
        HAPPY_ACCOUNT_SECRET: resolveEnvValue('HAPPY_ACCOUNT_SECRET', ''),
        DEFAULT_PROJECT_PATH: resolveEnvValue('DEFAULT_PROJECT_PATH', '/workspace'),
        HOST_PROJECTS_ROOT: resolveEnvValue('HOST_PROJECTS_ROOT', ''),
      },
      // Note: We recommend managing RUNTIME_API_TOKEN in deploy/services env files or passing it during launch.
      // e.g. pm2 start deploy/ecosystem.config.cjs --env production
    },
  ],
};
