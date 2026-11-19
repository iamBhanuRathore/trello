import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@boardly/ui/dialog';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { Switch } from '@boardly/ui/switch';
import { ConfirmDialog } from '@boardly/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boardly/ui/select';
import { QueryError } from '../../components/common/QueryError';
import { useDialogClose } from '../../hooks/useDialogClose';
import { API_MODULES, type ApiModuleId } from '@boardly/shared-types';
import { Check, Copy, Inbox, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createInboundEndpoint,
  deleteInboundEndpoint,
  listInboundEndpoints,
  updateInboundEndpoint,
  type InboundEndpoint,
} from './lib/integrationsApi';
import { InboundEntityPicker } from './InboundEntityPicker';
import { formatNumber } from './lib/format';

const QUERY_KEY = ['integration-inbound'];

export function InboundTab() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [module, setModule] = useState<ApiModuleId>('cards');
  const [defaultRefId, setDefaultRefId] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<InboundEndpoint | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const {
    data: endpoints = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listInboundEndpoints,
  });

  const { handleOpenChange } = useDialogClose({
    isOpen: creating,
    onClose: () => setCreating(false),
  });

  const resetForm = () => {
    setLabel('');
    setModule('cards');
    setDefaultRefId(null);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createInboundEndpoint({
        label: label.trim() || undefined,
        targetModule: module,
        defaultRefId,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setCreating(false);
      resetForm();
      setRevealedId(created.id);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create inbound URL'),
  });

  const toggleMutation = useMutation({
    mutationFn: (endpoint: InboundEndpoint) =>
      updateInboundEndpoint(endpoint.id, { isActive: !endpoint.isActive }),
    onMutate: async (endpoint) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<InboundEndpoint[]>(QUERY_KEY);
      queryClient.setQueryData<InboundEndpoint[]>(QUERY_KEY, (old = []) =>
        old.map((e) => (e.id === endpoint.id ? { ...e, isActive: !e.isActive } : e))
      );
      return { previous };
    },
    onError: (err: Error, _endpoint, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
      toast.error(err.message || 'Failed to update inbound URL');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: (endpoint: InboundEndpoint) => deleteInboundEndpoint(endpoint.id),
    onMutate: async (endpoint) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<InboundEndpoint[]>(QUERY_KEY);
      queryClient.setQueryData<InboundEndpoint[]>(QUERY_KEY, (old = []) =>
        old.filter((e) => e.id !== endpoint.id)
      );
      return { previous };
    },
    onError: (err: Error, _endpoint, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
      toast.error(err.message || 'Failed to delete inbound URL');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const copyUrl = async (endpoint: InboundEndpoint) => {
    if (!endpoint.url) {
      toast.error('This URL cannot be recovered — delete it and create a new one');
      return;
    }
    try {
      await navigator.clipboard.writeText(endpoint.url);
      setCopiedId(endpoint.id);
      setTimeout(() => setCopiedId((id) => (id === endpoint.id ? null : id)), 1500);
    } catch {
      toast.error('Clipboard unavailable — expand the URL and copy manually');
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-card/60 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-semibold">Inbound webhook URLs</h2>
            <p className="text-xs text-muted-foreground">
              POST JSON to a tokenized URL to create cards, boards, projects or comments. Unknown
              fields are ignored; invalid fields return 422.
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0 gap-1.5 text-xs"
            onClick={() => {
              // The picker's drill-down state lives inside the dialog and resets
              // on close; reset the stored default too or a reopened dialog would
              // submit an invisible stale reference.
              resetForm();
              setCreating(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> New inbound URL
          </Button>
        </div>
      </section>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border bg-muted/30" />
          ))}
        </div>
      ) : isError ? (
        <QueryError message="Couldn't load inbound URLs." onRetry={() => refetch()} />
      ) : endpoints.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border bg-muted/10 p-10 text-center">
          <Inbox className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm font-medium">No inbound URLs yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Create a URL per source (forms, email parsers, no-code tools) and point that tool at it.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {endpoints.map((endpoint) => {
            const moduleLabel =
              API_MODULES.find((m) => m.id === endpoint.targetModule)?.label ??
              endpoint.targetModule;
            return (
              <div
                key={endpoint.id}
                className={`flex flex-col gap-4 rounded-2xl border bg-card/80 p-4 shadow-xs lg:flex-row lg:items-center lg:justify-between ${
                  endpoint.isActive ? '' : 'opacity-70'
                }`}
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">{endpoint.label}</h3>
                    <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {moduleLabel}
                    </span>
                    <code className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {endpoint.tokenPrefix}…
                    </code>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>Hits: {formatNumber(endpoint.hits)}</span>
                    <span>
                      Last used:{' '}
                      <strong className="text-foreground">
                        {endpoint.lastUsedAt
                          ? new Date(endpoint.lastUsedAt).toLocaleString()
                          : 'Never'}
                      </strong>
                    </span>
                    {endpoint.lastStatusCode && <span>Last status: {endpoint.lastStatusCode}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setRevealedId(revealedId === endpoint.id ? null : endpoint.id)}
                    className="block max-w-full truncate text-left font-mono text-[11px] text-muted-foreground hover:text-foreground"
                    title="Show URL"
                  >
                    {revealedId === endpoint.id
                      ? (endpoint.url ?? 'URL unavailable')
                      : '••••••••••••••••••••••••••••'}
                  </button>
                </div>

                <div className="flex items-center gap-2 self-end lg:self-center">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-[11px]"
                    onClick={() => copyUrl(endpoint)}
                    disabled={!endpoint.url}
                  >
                    {copiedId === endpoint.id ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedId === endpoint.id ? 'Copied' : 'Copy URL'}
                  </Button>
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={endpoint.isActive}
                      aria-label={`${endpoint.label} active`}
                      disabled={toggleMutation.isPending}
                      onCheckedChange={() => toggleMutation.mutate(endpoint)}
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-rose-500"
                    aria-label={`Delete ${endpoint.label}`}
                    onClick={() => setConfirmDelete(endpoint)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={creating} onOpenChange={handleOpenChange}>
        <DialogContent className="w-full max-w-lg">
          <DialogHeader>
            <DialogTitle>New inbound URL</DialogTitle>
            <DialogDescription>
              The token is embedded in the URL and can be copied again later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inbound-label" className="text-xs font-medium">
                Label
              </Label>
              <Input
                id="inbound-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Website contact form"
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Creates</Label>
              <Select
                value={module}
                onValueChange={(v) => {
                  setModule(v as ApiModuleId);
                  setDefaultRefId(null);
                }}
              >
                <SelectTrigger className="h-9 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {API_MODULES.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <InboundEntityPicker module={module} value={defaultRefId} onChange={setDefaultRefId} />
            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => {
                  resetForm();
                  setCreating(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="text-xs"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Creating…' : 'Create URL'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title="Delete inbound URL?"
        description={`"${confirmDelete?.label}" will stop accepting requests immediately. Any tool still posting to it will receive a 401.`}
        confirmLabel="Delete URL"
        variant="destructive"
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete);
        }}
      />
    </div>
  );
}
