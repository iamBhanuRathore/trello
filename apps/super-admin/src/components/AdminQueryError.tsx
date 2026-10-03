import { AlertTriangle } from 'lucide-react';
import { Button } from '@boardly/ui/button';

/**
 * Shared query-failure state for the platform console.
 *
 * The dashboard has an equivalent component; super-admin is a standalone app and
 * cannot import from it. Without this, a failed fetch rendered `0` for tenant and
 * user counts — indistinguishable from a genuinely empty platform, which is the
 * wrong thing to show an operator.
 */
export function AdminQueryError({
  message = "Couldn't load data from the platform API.",
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 p-8 text-center ${className ?? ''}`}
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
