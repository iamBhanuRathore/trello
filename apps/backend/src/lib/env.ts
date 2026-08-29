import { z } from 'zod';

/**
 * Environment variable validation — fails fast at startup if required vars are missing.
 * Never access process.env directly in application code; import `env` from here instead.
 */
const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().url().default('postgresql://boardly:boardly_dev@localhost:5432/boardly_dev'),
  DATABASE_TEST_URL: z.string().url().optional(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Auth
  JWT_SECRET: z.string().min(32).default('ZptMgi0ZAemUmS3Ku3COjAWHgBcIylR0zvZiN7YtmARoz8BbIHnNluqfAZkr/6Z3'),
  REFRESH_TOKEN_SECRET: z.string().min(32).default('ayUfgRGoM07P8GvHIBN1Movg5hwx33/jZSQqYMC6luDz+9+84VG48EgbwT5HGX2v'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),

  // App URLs
  DASHBOARD_URL: z.string().default('http://localhost:5173'),
  API_URL: z.string().default('http://localhost:3001'),

  // WorkOS (enterprise SSO & Google OAuth — optional at dev time)
  WORKOS_API_KEY: z.string().optional(),
  WORKOS_CLIENT_ID: z.string().optional(),
  WORKOS_REDIRECT_URI: z.string().optional(),
  WORKOS_WEBHOOK_SECRET: z.string().optional(),

  // Stripe (billing — optional at dev time)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Storage (S3-compatible — optional at dev time)
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_ENDPOINT: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .pipe(z.string().url().optional()),

  // Email / Notifications (SES / SMTP / Console fallback)
  APP_URL: z.string().default('http://localhost:5173'),
  EMAIL_FROM: z.string().default('Boardly <noreply@boardly.app>'),
  AWS_SES_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_SECURE: z.coerce.boolean().optional().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
