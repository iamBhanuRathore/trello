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
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://boardly:boardly_dev@localhost:5432/boardly_dev'),
  DATABASE_REPLICA_URL: z.string().url().optional(),
  DATABASE_TEST_URL: z.string().url().optional(),
  // Connections per instance. Every query in the app runs on this one pool —
  // read-replica routing was removed as dead code (docs/Decisions.md), so this
  // number is the entire DB concurrency budget for a process. Raise it only
  // after confirming the RDS Proxy / PgBouncer backend can absorb the extra
  // connections; it is per-instance, so `max × replicas` is the real total.
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(5),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_CHANNEL: z.string().default('boardly:realtime'),
  // NOTE: z.coerce.boolean() treats ANY non-empty string (incl. "false") as
  // true, which silently disabled Redis. Parse explicitly instead.
  REDIS_DISABLED: z.preprocess(
    (v) => v === true || v === 'true' || v === '1',
    z.boolean().default(false)
  ),
  PRESENCE_TTL_SECONDS: z.coerce.number().default(60),

  // Auth — dev-only fallback defaults so `bun dev` boots without secrets.
  // Production MUST provide real values: superRefine below rejects defaults,
  // placeholders, and short secrets when NODE_ENV=production.
  JWT_SECRET: z
    .string()
    .min(32)
    .default('ZptMgi0ZAemUmS3Ku3COjAWHgBcIylR0zvZiN7YtmARoz8BbIHnNluqfAZkr/6Z3'),
  REFRESH_TOKEN_SECRET: z
    .string()
    .min(32)
    .default('ayUfgRGoM07P8GvHIBN1Movg5hwx33/jZSQqYMC6luDz+9+84VG48EgbwT5HGX2v'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  // Legacy single-knob refresh lifetime — fallback for one release. Prefer the
  // idle/absolute pair below; when those are unset the legacy value (or 30d)
  // applies to both.
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),
  // Sliding refresh windows: idle extends on every rotation, absolute never
  // does (forces re-login). Super-admin overrides are optional and clamp to
  // the main values when unset.
  REFRESH_IDLE_EXPIRES_IN: z.string().optional(),
  REFRESH_ABSOLUTE_EXPIRES_IN: z.string().optional(),
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().default(10),
  REFRESH_GRACE_MAX_USES: z.coerce.number().default(2),
  SUPERADMIN_REFRESH_IDLE_EXPIRES_IN: z.string().optional(),
  SUPERADMIN_REFRESH_ABSOLUTE_EXPIRES_IN: z.string().optional(),

  // App URLs
  DASHBOARD_URL: z.string().default('http://localhost:5173'),
  API_URL: z.string().default('http://localhost:3001'),

  // WorkOS (enterprise SSO & Google OAuth — optional at dev time)
  WORKOS_API_KEY: z.string().optional(),
  WORKOS_CLIENT_ID: z.string().optional(),
  WORKOS_REDIRECT_URI: z.string().optional(),
  WORKOS_WEBHOOK_SECRET: z.string().optional(),

  // Google Calendar sync (direct Calendar API — optional at dev time).
  // Create OAuth credentials at https://console.cloud.google.com/apis/credentials
  // with the redirect URI below; refresh tokens are AES-GCM encrypted at rest.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  CALENDAR_TOKEN_KEY: z.string().optional(),

  // Stripe (billing — optional at dev time)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRO_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_PRO_ANNUAL_PRICE_ID: z.string().optional(),
  STRIPE_BUSINESS_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_BUSINESS_ANNUAL_PRICE_ID: z.string().optional(),
  STRIPE_GUEST_OVERAGE_PRICE_ID: z.string().optional(),

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

  // Email / Notifications (Resend -> SES -> SMTP -> Console fallback)
  APP_URL: z.string().default('http://localhost:5173'),
  EMAIL_FROM: z.string().default('Boardly <noreply@boardly.app>'),
  RESEND_API_KEY: z.string().optional(),
  AWS_SES_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_SECURE: z.coerce.boolean().optional().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // Error monitoring (Sentry). Optional at every stage: an empty DSN makes
  // initSentry() a no-op, so local dev and CI never open a client.
  SENTRY_DSN: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .pipe(z.string().url().optional()),
  // Forces the client on outside production (staging smoke tests). Explicit
  // parse: z.coerce.boolean() reads the string "false" as true.
  SENTRY_ENABLED: z.preprocess(
    (v) => v === true || v === 'true' || v === '1',
    z.boolean().default(false)
  ),
  // Release identifier injected by CI at deploy time. Must be byte-identical
  // to the VITE_GIT_SHA the frontends were built with or sourcemaps uploaded
  // in phase 2 will not match the events they are meant to deobfuscate.
  GIT_SHA: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .pipe(z.string().optional()),
});

const parsed = envSchema
  .superRefine((val, ctx) => {
    // Duration syntax shared with auth/service.ts durationToMs.
    const toMs = (d: string): number | null => {
      const m = d.match(/^(\d+)([smhd])$/);
      if (!m) return null;
      const mult: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
      return Number(m[1]) * (mult[m[2]!] ?? 0);
    };
    const issue = (path: string[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    // Effective lifetimes must parse and satisfy idle <= absolute.
    const idle = val.REFRESH_IDLE_EXPIRES_IN ?? val.REFRESH_TOKEN_EXPIRES_IN ?? '7d';
    const absolute = val.REFRESH_ABSOLUTE_EXPIRES_IN ?? val.REFRESH_TOKEN_EXPIRES_IN ?? '30d';
    const idleMs = toMs(idle);
    const absMs = toMs(absolute);
    if (idleMs === null) issue(['REFRESH_IDLE_EXPIRES_IN'], 'Must match /^(\\d+)([smhd])$/');
    if (absMs === null) issue(['REFRESH_ABSOLUTE_EXPIRES_IN'], 'Must match /^(\\d+)([smhd])$/');
    if (idleMs !== null && absMs !== null && idleMs > absMs) {
      issue(['REFRESH_IDLE_EXPIRES_IN'], 'Idle lifetime must be <= absolute lifetime');
    }
    for (const [key, v] of [
      ['SUPERADMIN_REFRESH_IDLE_EXPIRES_IN', val.SUPERADMIN_REFRESH_IDLE_EXPIRES_IN],
      ['SUPERADMIN_REFRESH_ABSOLUTE_EXPIRES_IN', val.SUPERADMIN_REFRESH_ABSOLUTE_EXPIRES_IN],
    ] as const) {
      if (v !== undefined && toMs(v) === null) issue([key], 'Must match /^(\\d+)([smhd])$/');
    }
    const sIdle = val.SUPERADMIN_REFRESH_IDLE_EXPIRES_IN;
    const sAbs = val.SUPERADMIN_REFRESH_ABSOLUTE_EXPIRES_IN;
    if (sIdle !== undefined && sAbs !== undefined) {
      const a = toMs(sIdle);
      const b = toMs(sAbs);
      if (a !== null && b !== null && a > b) {
        issue(['SUPERADMIN_REFRESH_IDLE_EXPIRES_IN'], 'Idle lifetime must be <= absolute lifetime');
      }
    }
    if (
      !Number.isFinite(val.REFRESH_REUSE_GRACE_SECONDS) ||
      val.REFRESH_REUSE_GRACE_SECONDS < 0 ||
      val.REFRESH_REUSE_GRACE_SECONDS > 300
    ) {
      issue(['REFRESH_REUSE_GRACE_SECONDS'], 'Must be between 0 and 300 seconds');
    }
    if (
      !Number.isInteger(val.REFRESH_GRACE_MAX_USES) ||
      val.REFRESH_GRACE_MAX_USES < 1 ||
      val.REFRESH_GRACE_MAX_USES > 10
    ) {
      issue(['REFRESH_GRACE_MAX_USES'], 'Must be an integer between 1 and 10');
    }
    if (val.NODE_ENV === 'production') {
      for (const key of ['JWT_SECRET', 'REFRESH_TOKEN_SECRET'] as const) {
        const secret = val[key] as string;
        if (
          !secret ||
          secret.length < 32 ||
          /replace-me|dev-only|placeholder|test|changeme|example/i.test(secret) ||
          secret === 'ZptMgi0ZAemUmS3Ku3COjAWHgBcIylR0zvZiN7YtmARoz8BbIHnNluqfAZkr/6Z3' ||
          secret === 'ayUfgRGoM07P8GvHIBN1Movg5hwx33/jZSQqYMC6luDz+9+84VG48EgbwT5HGX2v'
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} must be set to a unique random value (>=32 chars) in production`,
          });
        }
      }
    }
  })
  .safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
