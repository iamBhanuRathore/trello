import React from 'react';
import { Button } from '@boardly/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { captureRenderError } from '../lib/sentry';

/**
 * Crash containment for the platform-admin portal. A render throw here blanks
 * the screen an operator needs during an incident, so the fallback always
 * offers a reload, and the throw is captured — a boundary swallows the error,
 * so it never reaches Sentry's global handlers.
 */
export class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string | null }
> {
  state: { hasError: boolean; message: string | null } = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): { hasError: boolean; message: string | null } {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    captureRenderError(error, info.componentStack);
    // eslint-disable-next-line no-console
    console.error('[RootErrorBoundary] super-admin render crashed:', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4 sm:p-8">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
            <div className="absolute inset-0 animate-pulse rounded-3xl bg-destructive/20 blur-xl" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-destructive/20 bg-card text-destructive shadow-2xl">
              <AlertTriangle className="h-10 w-10 stroke-[1.75]" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-destructive">
              Something went wrong
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              The console crashed
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              This screen hit an unexpected error and stopped. Reload to continue — no tenant data
              was modified.
            </p>
            {this.state.message && (
              <details className="mx-auto max-w-sm rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-left">
                <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">
                  Error details
                </summary>
                <p className="mt-1 break-words font-mono text-xs text-muted-foreground">
                  {this.state.message}
                </p>
              </details>
            )}
          </div>

          <Button
            className="w-full gap-2 cursor-pointer sm:w-auto"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4" /> Reload console
          </Button>
        </div>
      </div>
    );
  }
}
