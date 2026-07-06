import { z } from 'zod';

const configSchema = z.object({
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(4080),
  RUNTIME_API_TOKEN: z.string().min(12).default('change-this-runtime-token'),
  RUNTIME_BACKEND: z.enum(['mock', 'prisma']).default('mock'),
  DATABASE_URL: z.string().optional(),
  DEFAULT_PROJECT_PATH: z.string().min(1).default('/workspace'),
  HOST_PROJECTS_ROOT: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ARIS_SESSION_AUTO_IMPORT: z.string().default('0').transform((value) => ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())),
  ARIS_SESSION_IMPORT_INTERVAL_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  ARIS_SESSION_IMPORT_LOOKBACK_DAYS: z.coerce.number().int().positive().default(7),
  ARIS_SESSION_IMPORT_MAX_FILES: z.coerce.number().int().positive().default(20),
  ARIS_SESSION_IMPORT_MAX_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),
  ARIS_SESSION_IMPORT_TAIL_TURNS: z.coerce.number().int().positive().default(3),
  ARIS_SESSION_IMPORT_USER_ID: z.string().trim().optional(),
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
  throw new Error(`Invalid environment: ${issues}`);
}

export const config = parsed.data;
