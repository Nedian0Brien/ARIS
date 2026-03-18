import { z } from 'zod';

const configSchema = z.object({
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(4080),
  RUNTIME_API_TOKEN: z.string().min(12).default('change-this-runtime-token'),
  RUNTIME_BACKEND: z.enum(['mock', 'happy', 'prisma']).default('mock'),
  DATABASE_URL: z.string().optional(),
  HAPPY_SERVER_URL: z.string().url().default('http://127.0.0.1:4080'),
  HAPPY_SERVER_TOKEN: z.string().default(''),
  HAPPY_ACCOUNT_SECRET: z.string().default(''),
  DEFAULT_PROJECT_PATH: z.string().min(1).default('/workspace'),
  HOST_PROJECTS_ROOT: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
  throw new Error(`Invalid environment: ${issues}`);
}

export const config = parsed.data;
