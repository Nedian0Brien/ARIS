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
      },
      // Note: We recommend managing RUNTIME_API_TOKEN in .env or passing it during launch
      // e.g. pm2 start deploy/ecosystem.config.cjs --env production
    },
  ],
};
