import { t } from 'elysia';

/**
 * Board backgrounds are preset gradients/hex colors — never arbitrary CSS.
 * The char class admits `linear-gradient(135deg, #rrggbb …)` and preset ids
 * but rejects `url(`, quotes, semicolons and angle brackets (CSS exfil/XSS).
 */
export const BackgroundSchema = t.String({
  maxLength: 500,
  pattern: '^(#[0-9a-fA-F]{6}|linear-gradient\\([#0-9a-fA-Fa-z(), %.\\-]+\\)|[a-z0-9-]{1,32})$',
});

/** User/org-controlled image URLs: https only, no spaces/brackets/quotes. */
export const HttpsUrlSchema = t.String({
  maxLength: 2048,
  pattern: '^https://[^\\s<>"]{1,2000}$',
});
