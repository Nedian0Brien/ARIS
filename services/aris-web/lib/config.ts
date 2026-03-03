import { z } from 'zod';

const envSchema = z.object({
  AUTH_JWT_SECRET: z.string().min(32).default('dev-only-jwt-secret-dev-only-jwt-secret'),
  AUTH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_COOKIE_NAME: z.string().min(1).default('aris_session'),
  HAPPY_SERVER_URL: z.string().url().default('http://localhost:4080'),
  HAPPY_SERVER_TOKEN: z.string().optional(),
  SSH_BASE_COMMAND: z.string().default('ssh ubuntu@your-server'),
  SSH_LINK_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
  throw new Error(`Invalid environment variables: ${problems}`);
}

export const env = parsed.data;
