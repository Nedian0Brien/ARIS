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
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
  throw new Error(`Invalid environment: ${issues}`);
}

export const config = parsed.data;
