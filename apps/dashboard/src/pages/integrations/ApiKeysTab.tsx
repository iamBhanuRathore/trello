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
import { ConfirmDialog } from '@boardly/ui/confirm-dialog';
import { QueryError } from '../../components/common/QueryError';
import { useDialogClose } from '../../hooks/useDialogClose';
import { Plus, Copy, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  createApiKey,
  deleteApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyRecord,
  type CreateApiKeyBody,
} from './lib/integrationsApi';
import { ApiKeyCreateForm } from './ApiKeyCreateForm';
import { ApiKeyList } from './ApiKeyList';
import { baseApiUrl } from './lib/format';

const QUERY_KEY = ['integration-api-keys'];

export function ApiKeysTab() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<ApiKeyRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ApiKeyRecord | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    data: keys = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listApiKeys,
  });

  const { handleOpenChange: createClose } = useDialogClose({
    isOpen: creating,
    onClose: () => setCreating(false),
  });
  const { handleOpenChange: revealClose } = useDialogClose({
    isOpen: !!revealed,
    onClose: () => {
      setRevealed(null);
      setCopied(false);
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateApiKeyBody) => createApiKey(body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setCreating(false);
      setRevealed(data.rawKey);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create API key'),
  });

  const revokeMutation = useMutation({
    mutationFn: (key: ApiKeyRecord) => revokeApiKey(key.id),
    onMutate: async (key) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<ApiKeyRecord[]>(QUERY_KEY);
      queryClient.setQueryData<ApiKeyRecord[]>(QUERY_KEY, (old = []) =>
        old.map((k) => (k.id === key.id ? { ...k, revokedAt: new Date().toISOString() } : k))
      );
      return { previous };
    },
    onError: (err: Error, _key, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
      toast.error(err.message || 'Failed to revoke key');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: (key: ApiKeyRecord) => deleteApiKey(key.id),
    onMutate: async (key) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<ApiKeyRecord[]>(QUERY_KEY);
      queryClient.setQueryData<ApiKeyRecord[]>(QUERY_KEY, (old = []) =>
        old.filter((k) => k.id !== key.id)
      );
      return { previous };
    },
    onError: (err: Error, _key, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
      toast.error(err.message || 'Failed to delete key');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const copyKey = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
    } catch {
      toast.error('Clipboard unavailable — select the key and copy manually');
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-card/60 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-semibold">Public REST API</h2>
            <p className="text-xs text-muted-foreground">
              Scoped keys for cards, boards, projects and comments. Limits reset monthly at 00:00
              UTC.
            </p>
            <p className="break-all pt-1 font-mono text-[11px] text-muted-foreground">
              {baseApiUrl()}/public
            </p>
          </div>
          <Button size="sm" className="shrink-0 gap-1.5 text-xs" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> Generate key
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
        <QueryError
          message="Couldn't load API keys. Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : (
        <ApiKeyList
          keys={keys}
          pendingId={
            revokeMutation.isPending
              ? ((revokeMutation.variables as ApiKeyRecord | undefined)?.id ?? null)
              : deleteMutation.isPending
                ? ((deleteMutation.variables as ApiKeyRecord | undefined)?.id ?? null)
                : null
          }
          onRevoke={(key) => setConfirmRevoke(key)}
          onDelete={(key) => setConfirmDelete(key)}
        />
      )}

      <Dialog open={creating} onOpenChange={createClose}>
        <DialogContent className="w-full max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate API key</DialogTitle>
            <DialogDescription>
              The secret is shown once. Store it in your secret manager before closing.
            </DialogDescription>
          </DialogHeader>
          <ApiKeyCreateForm
            pending={createMutation.isPending}
            onCreate={(body) => createMutation.mutate(body)}
            onCancel={() => setCreating(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!revealed} onOpenChange={revealClose}>
        <DialogContent className="w-full max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy your new API key</DialogTitle>
            <DialogDescription>
              This is the only time the full key is visible. If you lose it, revoke the key and
              generate a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Never commit this key or expose it in client-side code.</span>
            </div>
            <button
              type="button"
              onClick={copyKey}
              className="flex w-full items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2.5 text-left font-mono text-xs hover:border-primary/50"
            >
              <span className="break-all">{revealed}</span>
              <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy'}
              </span>
            </button>
            <div className="flex justify-end">
              <Button size="sm" className="text-xs" onClick={() => setRevealed(null)}>
                I've saved it
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmRevoke}
        onOpenChange={(open) => {
          if (!open) setConfirmRevoke(null);
        }}
        title="Revoke API key?"
        description={`"${confirmRevoke?.name}" will stop authenticating immediately. The key stays listed for audit purposes.`}
        confirmLabel="Revoke key"
        variant="destructive"
        onConfirm={() => {
          if (confirmRevoke) revokeMutation.mutate(confirmRevoke);
        }}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title="Delete API key permanently?"
        description={`"${confirmDelete?.name}" and its usage history will be removed. This cannot be undone.`}
        confirmLabel="Delete permanently"
        variant="destructive"
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete);
        }}
      />
    </div>
  );
}
