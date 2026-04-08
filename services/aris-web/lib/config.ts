import { z } from 'zod';

const envSchema = z.object({
  AUTH_JWT_SECRET: z.string().min(32).default('dev-only-jwt-secret-dev-only-jwt-secret'),
  AUTH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_TOKEN_REMEMBER_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  AUTH_COOKIE_NAME: z.string().min(1).default('aris_session'),
  RUNTIME_API_URL: z.string().url().optional(),
  RUNTIME_API_TOKEN: z.string().optional(),
  HAPPY_SERVER_URL: z.string().url().optional(),
  HAPPY_SERVER_TOKEN: z.string().optional(),
  HOST_PROJECTS_ROOT: z.string().default(''),
  HOST_HOME_DIR: z.string().default('/home/ubuntu'),
  SSH_BASE_COMMAND: z.string().default('ssh ubuntu@your-server'),
  SSH_LINK_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  SSH_KEY_ENCRYPTION_SECRET: z.string().min(16).default('dev-only-ssh-enc-secret-change-me'),
  ARIS_AGENT_SKILLS_ROOT: z.string().default('/home/ubuntu/.agents/skills'),
  ARIS_CODEX_SKILLS_ROOT: z.string().default('/home/ubuntu/.codex/skills'),
  ARIS_CLAUDE_HOME: z.string().default('/home/ubuntu/.claude'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  
  /* SMTP Configuration for Email 2FA */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('noreply@aris.local'),
});

type ParsedEnv = z.infer<typeof envSchema>;

export function resolveRuntimeApiUrl(env: Pick<ParsedEnv, 'RUNTIME_API_URL' | 'HAPPY_SERVER_URL'>): string {
  // RUNTIME_API_URL takes precedence. HAPPY_SERVER_URL is kept for legacy compatibility
  // but should point to aris-backend (4080), not the happy server (3005).
  const next = env.RUNTIME_API_URL?.trim() || env.HAPPY_SERVER_URL?.trim() || '';
  return next || 'http://localhost:4080';
}

export function resolveRuntimeApiToken(env: Pick<ParsedEnv, 'RUNTIME_API_TOKEN' | 'HAPPY_SERVER_TOKEN'>): string | undefined {
  const next = env.RUNTIME_API_TOKEN?.trim() || env.HAPPY_SERVER_TOKEN?.trim() || '';
  return next || undefined;
}

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
  throw new Error(`Invalid environment variables: ${problems}`);
}

export const env = {
  ...parsed.data,
  RUNTIME_API_URL: resolveRuntimeApiUrl(parsed.data),
  RUNTIME_API_TOKEN: resolveRuntimeApiToken(parsed.data),
};
