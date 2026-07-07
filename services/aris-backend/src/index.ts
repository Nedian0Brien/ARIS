import { config } from './config.js';
import { buildServer } from './server.js';
import { runAgentSessionImportOnce } from './runtime/import/agentSessionImportWorker.js';

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

  const runtimeStore = (app as typeof app & {
    arisRuntimeStore?: {
      cleanupEmptyChats: (maxAgeMs: number) => Promise<number>;
      discoverImportedAgentSession: Parameters<typeof runAgentSessionImportOnce>[0]['store']['discoverImportedAgentSession'];
      resolveProjectSessionIdByPath: Parameters<typeof runAgentSessionImportOnce>[0]['store']['resolveProjectSessionIdByPath'];
      findOwningChat: Parameters<typeof runAgentSessionImportOnce>[0]['store']['findOwningChat'];
      ensureImportedAgentChat: Parameters<typeof runAgentSessionImportOnce>[0]['store']['ensureImportedAgentChat'];
      markImportedAgentSessionNative: Parameters<typeof runAgentSessionImportOnce>[0]['store']['markImportedAgentSessionNative'];
      updateSubagentChatMeta: Parameters<typeof runAgentSessionImportOnce>[0]['store']['updateSubagentChatMeta'];
      appendImportedAgentEvents: Parameters<typeof runAgentSessionImportOnce>[0]['store']['appendImportedAgentEvents'];
      listImportedAgentSessionsForBackfill: Parameters<typeof runAgentSessionImportOnce>[0]['store']['listImportedAgentSessionsForBackfill'];
      loadOlderImportedAgentEvents: Parameters<typeof runAgentSessionImportOnce>[0]['store']['loadOlderImportedAgentEvents'];
      beginShutdownDrain: () => void;
      awaitDrain: (timeoutMs: number) => Promise<void>;
    };
  }).arisRuntimeStore;

  const isClusterPrimary = process.env.NODE_APP_INSTANCE === undefined
    || process.env.NODE_APP_INSTANCE === '0';
  const EMPTY_CHAT_MAX_AGE_MS = 60 * 60 * 1000;
  const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
  let cleanupTimer: NodeJS.Timeout | null = null;
  let importTimer: NodeJS.Timeout | null = null;
  if (runtimeStore && isClusterPrimary) {
    const runCleanup = async () => {
      try {
        const removed = await runtimeStore.cleanupEmptyChats(EMPTY_CHAT_MAX_AGE_MS);
        if (removed > 0) {
          app.log.info({ removed }, 'cleaned up empty chats');
        }
      } catch (error) {
        app.log.error(error, 'failed to cleanup empty chats');
      }
    };
    void runCleanup();
    cleanupTimer = setInterval(() => { void runCleanup(); }, CLEANUP_INTERVAL_MS);
    cleanupTimer.unref();

    if (config.ARIS_SESSION_AUTO_IMPORT) {
      let importRunning = false;
      const runImport = async () => {
        if (importRunning) {
          return;
        }
        importRunning = true;
        try {
          const result = await runAgentSessionImportOnce({
            store: runtimeStore,
            projectPath: config.DEFAULT_PROJECT_PATH,
            userId: config.ARIS_SESSION_IMPORT_USER_ID,
            lookbackDays: config.ARIS_SESSION_IMPORT_LOOKBACK_DAYS,
            maxFiles: config.ARIS_SESSION_IMPORT_MAX_FILES,
            maxBytes: config.ARIS_SESSION_IMPORT_MAX_BYTES,
            tailTurns: config.ARIS_SESSION_IMPORT_TAIL_TURNS,
            mode: 'sync',
            maxEvents: config.ARIS_SESSION_IMPORT_MAX_EVENTS,
          });
          if (result.discovered > 0 || result.importedEvents > 0 || result.skipped > 0) {
            app.log.info(result, 'agent session import completed');
          }
        } catch (error) {
          app.log.error(error, 'failed to import agent sessions');
        } finally {
          importRunning = false;
        }
      };
      void runImport();
      importTimer = setInterval(() => { void runImport(); }, config.ARIS_SESSION_IMPORT_INTERVAL_MS);
      importTimer.unref();
    }
  }

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
    if (importTimer) {
      clearInterval(importTimer);
      importTimer = null;
    }
    runtimeStore?.beginShutdownDrain();
    await app.close();
    await runtimeStore?.awaitDrain(drainTimeoutMs);
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void bootstrap();
