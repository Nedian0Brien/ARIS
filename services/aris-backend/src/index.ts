import { config } from './config.js';
import { buildServer } from './server.js';

async function bootstrap() {
  const app = buildServer(config);

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
    app.log.info(`ARIS backend listening on ${config.HOST}:${config.PORT}`);
  } catch (error) {
    app.log.error(error, 'Failed to start ARIS backend');
    process.exit(1);
  }

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void bootstrap();
