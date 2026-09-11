import { Loader2 } from 'lucide-react';

/**
 * Shared Suspense fallback for all lazily-loaded routes and heavy modals.
 *
 * Convention (see docs/PROMPT_PATTERNS.md §4): every dashboard page MUST be
 * loaded via `React.lazy` + `Suspense` with this fallback so new routes
 * automatically get their own code-split chunk instead of bloating the
 * initial bundle.
 */
export function RouteFallback({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex h-full min-h-[40vh] w-full items-center justify-center gap-2 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
