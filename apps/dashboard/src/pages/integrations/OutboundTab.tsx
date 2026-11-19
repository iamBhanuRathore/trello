import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@boardly/ui/button';
import { Switch } from '@boardly/ui/switch';
import { ConfirmDialog } from '@boardly/ui/confirm-dialog';
import { QueryError } from '../../components/common/QueryError';
import { API_MODULES } from '@boardly/shared-types';
import { History, Pencil, Play, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createOutbound,
  deleteOutbound,
  listOutbound,
  setOutboundActive,
  testOutbound,
  updateOutbound,
  type OutboundIntegration,
} from './lib/integrationsApi';
import { OutboundFormDialog } from './OutboundFormDialog';
import { OutboundRunsDialog } from './OutboundRunsDialog';
import { draftFromIntegration, emptyOutboundDraft, triggerLabel } from './lib/outboundState';

const QUERY_KEY = ['integration-outbound'];

export function OutboundTab() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OutboundIntegration | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OutboundIntegration | null>(null);
  const [runsFor, setRunsFor] = useState<OutboundIntegration | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const {
    data: integrations = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listOutbound,
  });

  const initialDraft = useMemo(
    () => (editing ? draftFromIntegration(editing) : emptyOutboundDraft()),
    [editing]
  );

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createOutbound(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      closeForm();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create integration'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => updateOutbound(editing!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      closeForm();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save integration'),
  });

  const toggleMutation = useMutation({
    mutationFn: (integration: OutboundIntegration) =>
      setOutboundActive(integration.id, !integration.isActive),
    onMutate: async (integration) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<OutboundIntegration[]>(QUERY_KEY);
      queryClient.setQueryData<OutboundIntegration[]>(QUERY_KEY, (old = []) =>
        old.map((row) => (row.id === integration.id ? { ...row, isActive: !row.isActive } : row))
      );
      return { previous };
    },
    onError: (err: Error, _integration, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
      toast.error(err.message || 'Failed to update integration');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: (integration: OutboundIntegration) => deleteOutbound(integration.id),
    onMutate: async (integration) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<OutboundIntegration[]>(QUERY_KEY);
      queryClient.setQueryData<OutboundIntegration[]>(QUERY_KEY, (old = []) =>
        old.filter((row) => row.id !== integration.id)
      );
      return { previous };
    },
    onError: (err: Error, _integration, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
      toast.error(err.message || 'Failed to delete integration');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const testMutation = useMutation({
    mutationFn: (integration: OutboundIntegration) => testOutbound(integration.id),
    onMutate: (integration) => setTestingId(integration.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      if (result.status === 'success') toast.success('Test delivery succeeded');
      else if (result.status === 'skipped') toast.error('No matching record to send');
      else toast.error('Test delivery failed — check run history');
    },
    onError: (err: Error) => toast.error(err.message || 'Test delivery failed'),
    onSettled: () => setTestingId(null),
  });

  const pending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-card/60 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-semibold">Outbound integrations</h2>
            <p className="text-xs text-muted-foreground">
              Push Boardly events to CRMs and internal APIs with field mapping, auth token caching
              and retry on network or 5xx failures.
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0 gap-1.5 text-xs"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> New integration
          </Button>
        </div>
      </section>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border bg-muted/30" />
          ))}
        </div>
      ) : isError ? (
        <QueryError message="Couldn't load outbound integrations." onRetry={() => refetch()} />
      ) : integrations.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border bg-muted/10 p-10 text-center">
          <Send className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm font-medium">No outbound integrations yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Connect a CRM or internal endpoint, map Boardly fields to its payload, and pick the
            events that should fire.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map((integration) => {
            const moduleLabel =
              API_MODULES.find((m) => m.id === integration.sourceModule)?.label ??
              integration.sourceModule;
            const host = destinationHost(integration);
            return (
              <div
                key={integration.id}
                className={`flex flex-col gap-4 rounded-2xl border bg-card/80 p-4 shadow-xs xl:flex-row xl:items-center xl:justify-between ${
                  integration.isActive ? '' : 'opacity-70'
                }`}
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">{integration.name}</h3>
                    <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {moduleLabel}
                    </span>
                    {integration.lastStatus && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          integration.lastStatus === 'success'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        Last run {integration.lastStatus}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {integration.triggerEvents.map((event) => (
                      <span
                        key={event}
                        className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {triggerLabel(integration.sourceModule, event)}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="truncate font-mono">{host ?? 'No destination'}</span>
                    <span>
                      Last run:{' '}
                      <strong className="text-foreground">
                        {integration.lastRunAt
                          ? new Date(integration.lastRunAt).toLocaleString()
                          : 'Never'}
                      </strong>
                    </span>
                    {integration.lastError && (
                      <span className="truncate text-rose-500" title={integration.lastError}>
                        {integration.lastError}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 self-end xl:self-center">
                  <Switch
                    checked={integration.isActive}
                    aria-label={`${integration.name} active`}
                    onCheckedChange={() => toggleMutation.mutate(integration)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-[11px]"
                    disabled={testingId === integration.id}
                    onClick={() => testMutation.mutate(integration)}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {testingId === integration.id ? 'Sending…' : 'Send test'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1.5 text-[11px]"
                    onClick={() => setRunsFor(integration)}
                  >
                    <History className="h-3.5 w-3.5" /> History
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground"
                    aria-label={`Edit ${integration.name}`}
                    onClick={() => {
                      setEditing(integration);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-rose-500"
                    aria-label={`Delete ${integration.name}`}
                    onClick={() => setConfirmDelete(integration)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <OutboundFormDialog
          key={editing?.id ?? 'new'}
          open={formOpen}
          mode={editing ? 'edit' : 'create'}
          initialDraft={initialDraft}
          pending={pending}
          onClose={closeForm}
          onSubmit={(payload) =>
            editing ? updateMutation.mutate(payload) : createMutation.mutate(payload)
          }
        />
      )}

      <OutboundRunsDialog integration={runsFor} onClose={() => setRunsFor(null)} />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title="Delete outbound integration?"
        description={`"${confirmDelete?.name}" will stop sending events immediately and its run history will be removed.`}
        confirmLabel="Delete integration"
        variant="destructive"
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete);
        }}
      />
    </div>
  );
}

function destinationHost(integration: OutboundIntegration): string | null {
  const url = integration.dataConfig?.url;
  if (typeof url !== 'string' || !url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
