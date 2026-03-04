const fs = require('fs');
const path = require('path');

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

function resolveRuntimeToken() {
  if (process.env.RUNTIME_API_TOKEN) {
    return process.env.RUNTIME_API_TOKEN;
  }

  const envFiles = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', 'services', 'aris-backend', '.env'),
    path.join(process.cwd(), 'deploy', '.env'),
    path.join(process.cwd(), 'services', 'aris-backend', '.env'),
  ];

  for (const envFile of envFiles) {
    const value = readEnvValue(envFile, 'RUNTIME_API_TOKEN');
    if (value) {
      return value;
    }
  }

  return 'change-this-runtime-token';
}

module.exports = {
  apps: [
    {
      name: 'aris-backend',
      script: 'npm',
      args: 'run start',
      cwd: './services/aris-backend',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 4080,
        RUNTIME_API_TOKEN: resolveRuntimeToken(),
      },
      // Note: We recommend managing RUNTIME_API_TOKEN in deploy/services env files or passing it during launch.
      // e.g. pm2 start deploy/ecosystem.config.cjs --env production
    },
  ],
};
