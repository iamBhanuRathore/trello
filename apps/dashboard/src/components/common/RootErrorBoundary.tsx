import React from 'react';
import { Button } from '@boardly/ui/button';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';

interface RootErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * When this value changes the tripped boundary resets itself, so navigating
   * away from a crashed route and back doesn't stick on the fallback. The App
   * shell passes the current pathname.
   */
  resetKey?: string | null;
}

interface RootErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

/**
 * Last-resort crash containment for the route tree. Without this, a single
 * render throw (bad chunk after a deploy, a torn HMR graph in dev, an
 * unexpected null) unmounts the entire app into a blank page with no recovery
 * path — the failure the user can do nothing about. The fallback explains,
 * offers a local retry for transient errors and a full reload that always
 * works (lazy chunks cache their rejection, so retry alone can't fix a failed
 * chunk load).
 */
export class RootErrorBoundary extends React.Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    // Intentional: a crash boundary's job is to surface the error. This is
    // the seam where an error-tracking SDK plugs in.
    // eslint-disable-next-line no-console
    console.error('[RootErrorBoundary] route render crashed:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: RootErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: null });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background p-4 sm:p-8">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
            <div className="absolute inset-0 bg-destructive/20 rounded-3xl blur-xl animate-pulse" />
            <div className="relative w-20 h-20 rounded-2xl bg-card border border-border/80 shadow-2xl flex items-center justify-center text-destructive">
              <AlertTriangle className="w-10 h-10 stroke-[1.75]" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-destructive/10 text-destructive border border-destructive/20">
              Something went wrong
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              This page crashed
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The page ran into an unexpected error and had to stop. Your work is safe — try again,
              or reload to start fresh.
            </p>
            {this.state.message && (
              <details className="text-left mx-auto max-w-sm rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <summary className="text-xs font-medium text-muted-foreground cursor-pointer select-none">
                  Error details
                </summary>
                <p className="mt-1 text-xs text-muted-foreground break-words font-mono">
                  {this.state.message}
                </p>
              </details>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              variant="default"
              size="default"
              className="w-full sm:w-auto gap-2 cursor-pointer"
              onClick={this.handleRetry}
            >
              <RotateCcw className="w-4 h-4" /> Try again
            </Button>
            <Button
              variant="outline"
              size="default"
              className="w-full sm:w-auto gap-2 cursor-pointer"
              onClick={this.handleReload}
            >
              <RefreshCw className="w-4 h-4" /> Reload page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
