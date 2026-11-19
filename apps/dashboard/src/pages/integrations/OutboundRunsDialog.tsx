import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@boardly/ui/dialog';
import { QueryError } from '../../components/common/QueryError';
import { useDialogClose } from '../../hooks/useDialogClose';
import { listOutboundRuns, type OutboundIntegration } from './lib/integrationsApi';
import { triggerLabel } from './lib/outboundState';

interface Props {
  integration: OutboundIntegration | null;
  onClose: () => void;
}

export function OutboundRunsDialog({ integration, onClose }: Props) {
  const { handleOpenChange } = useDialogClose({ isOpen: !!integration, onClose });
  const {
    data: runs = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['outbound-runs', integration?.id],
    queryFn: () => listOutboundRuns(integration!.id),
    enabled: !!integration,
  });

  return (
    <Dialog open={!!integration} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>Run history</DialogTitle>
          <DialogDescription>
            Last 50 runs for &ldquo;{integration?.name}&rdquo;. Retention is 30 days.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border bg-muted/30" />
            ))}
          </div>
        ) : isError ? (
          <QueryError message="Couldn't load run history." onRetry={() => refetch()} />
        ) : runs.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/10 p-8 text-center text-xs text-muted-foreground">
            No runs yet. Trigger an event or use &ldquo;Send test&rdquo;.
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {runs.map((run) => (
              <div key={run.id} className="rounded-xl border bg-card/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      run.status === 'success'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {run.status}
                  </span>
                  <span className="text-xs font-medium">
                    {integration ? triggerLabel(integration.sourceModule, run.event) : run.event}
                  </span>
                  {run.responseStatus && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      HTTP {run.responseStatus}
                    </span>
                  )}
                  {run.durationMs !== null && (
                    <span className="text-[11px] text-muted-foreground">{run.durationMs} ms</span>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </div>
                {run.error && <p className="mt-1 text-[11px] text-rose-500">{run.error}</p>}
                {run.responseBody && (
                  <pre className="mt-1 max-h-24 overflow-auto rounded-md bg-muted/60 p-2 text-[10px] text-muted-foreground">
                    {run.responseBody}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
