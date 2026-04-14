import { config } from './config.js';
import { buildServer } from './server.js';

async function bootstrap() {
  const app = buildServer(config);
  const drainTimeoutMs = (() => {
    const parsed = Number.parseInt(process.env.ARIS_BACKEND_DRAIN_TIMEOUT_MS || '', 10);
    if (Number.isFinite(parsed) && parsed >= 5_000) {
      return parsed;
    }
    return 10 * 60 * 1000;
  })();

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
    app.log.info(`ARIS backend listening on ${config.HOST}:${config.PORT}`);
  } catch (error) {
    app.log.error(error, 'Failed to start ARIS backend');
    process.exit(1);
  }

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    const runtimeStore = (app as typeof app & {
      arisRuntimeStore?: {
        beginShutdownDrain: () => void;
        awaitDrain: (timeoutMs: number) => Promise<void>;
      };
    }).arisRuntimeStore;
    runtimeStore?.beginShutdownDrain();
    await app.close();
    await runtimeStore?.awaitDrain(drainTimeoutMs);
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void bootstrap();
