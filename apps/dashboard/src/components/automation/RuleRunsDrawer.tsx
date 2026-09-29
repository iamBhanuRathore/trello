import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { History } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@boardly/ui/dialog';
import { Button } from '@boardly/ui/button';
import { SearchableSelect } from '@boardly/ui/searchable-select';
import { QueryError } from '../common/QueryError';
import { useDialogClose } from '../../hooks/useDialogClose';
import {
  automationService,
  reasonLabel,
  type ProjectAutomationRule,
  type RunStatus,
} from '../../lib/automationService';
import { getApiErrorMessage } from '../../lib/api';

const STATUS_STYLES: Record<RunStatus, string> = {
  executed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  skipped: 'bg-muted text-muted-foreground',
  failed: 'bg-destructive/10 text-destructive',
};

export function RuleRunsDrawer({
  projectId,
  rule,
  onClose,
}: {
  projectId: string;
  rule: ProjectAutomationRule;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const { requestClose, handleOpenChange, handleOverlayClick } = useDialogClose({
    isOpen: true,
    onClose,
  });

  const runsQuery = useQuery({
    queryKey: ['automationRuns', projectId, rule.id, page, status],
    queryFn: () =>
      automationService.listRuns(projectId, rule.id, {
        page,
        limit: 20,
        status: status || undefined,
      }),
    // Runs land async (event-driven engine) — refresh while open so a just-fired
    // rule appears without closing/reopening. Stops on unmount.
    refetchInterval: 5000,
  });

  const totalPages = Math.max(
    1,
    Math.ceil((runsQuery.data?.total ?? 0) / (runsQuery.data?.limit ?? 20))
  );

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        onClick={handleOverlayClick}
        className="w-full sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        aria-label={`Run history for ${rule.name}`}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 shrink-0" />
            <span className="truncate">Run history — {rule.name}</span>
          </DialogTitle>
          <DialogDescription>Every execution, including skips with reasons.</DialogDescription>
        </DialogHeader>

        <div className="shrink-0 px-1">
          <SearchableSelect
            options={[
              { value: '', label: 'All statuses' },
              { value: 'executed', label: 'Executed' },
              { value: 'skipped', label: 'Skipped' },
              { value: 'failed', label: 'Failed' },
            ]}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            size="sm"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 py-1 pr-0.5">
          {runsQuery.isLoading && (
            <div className="space-y-2" aria-label="Loading runs">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          )}
          {runsQuery.isError && (
            <QueryError
              message={getApiErrorMessage(runsQuery.error, 'Could not load run history.')}
              onRetry={() => runsQuery.refetch()}
            />
          )}
          {runsQuery.data?.items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No runs yet{status ? ' with this status' : ''} — fire the trigger to see history here.
            </p>
          )}
          {runsQuery.data?.items.map((run) => (
            <div key={run.id} className="rounded-lg border border-border p-3 space-y-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[run.status]}`}
                >
                  {run.status}
                </span>
                <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                  {run.reason ? reasonLabel(run.reason) : (run.details?.event ?? '')}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                </span>
              </div>
              {(
                run.details?.results as
                  | Array<{
                      actionId: string;
                      type: string;
                      outcome: string;
                      reason?: string;
                      detail: string;
                    }>
                  | undefined
              )?.length ? (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => (e === run.id ? null : run.id))}
                  className="text-xs text-primary hover:underline cursor-pointer"
                  aria-expanded={expanded === run.id}
                >
                  {expanded === run.id
                    ? 'Hide actions'
                    : `Show ${(run.details.results as unknown[]).length} actions`}
                </button>
              ) : null}
              {expanded === run.id && (
                <ul className="space-y-1 pt-1">
                  {(
                    run.details.results as Array<{
                      actionId: string;
                      type: string;
                      outcome: string;
                      reason?: string;
                      detail: string;
                    }>
                  ).map((r, i) => (
                    <li
                      key={r.actionId + i}
                      className="text-xs rounded bg-muted/60 px-2 py-1.5 flex flex-col gap-0.5"
                    >
                      <span className="font-medium">
                        {r.type} — {r.outcome}
                        {r.reason ? ` (${reasonLabel(r.reason)})` : ''}
                      </span>
                      {r.detail && (
                        <span className="text-muted-foreground break-words">{r.detail}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="cursor-pointer"
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="cursor-pointer"
            >
              Next
            </Button>
            <Button size="sm" onClick={requestClose} className="cursor-pointer">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
