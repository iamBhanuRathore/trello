import { AlertTriangle } from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { cn } from '@boardly/ui/utils';

/**
 * Shared query-failure state: every `useQuery` surface renders this (with a
 * retry) instead of collapsing into a fake empty state. `compact` fits
 * dropdowns, sidebar rows, and other tight spaces.
 */
export function QueryError({
  message = "Couldn't load data. Check your connection and try again.",
  onRetry,
  compact = false,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <div
        className={cn('flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground', className)}
        role="alert"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive/70" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{message}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 font-semibold text-primary hover:underline cursor-pointer"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 p-8 text-center', className)}
      role="alert"
    >
      <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs cursor-pointer"
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </div>
  );
}
