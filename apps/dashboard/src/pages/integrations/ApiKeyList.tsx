import { Clock, KeyRound, Trash2 } from 'lucide-react';
import { Button } from '@boardly/ui/button';
import type { ApiKeyRecord } from './lib/integrationsApi';
import { formatNumber } from './lib/format';

interface Props {
  keys: ApiKeyRecord[];
  onRevoke: (key: ApiKeyRecord) => void;
  onDelete: (key: ApiKeyRecord) => void;
  pendingId?: string | null;
}

export function ApiKeyList({ keys, onRevoke, onDelete, pendingId }: Props) {
  if (keys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border bg-muted/10 p-10 text-center">
        <KeyRound className="h-7 w-7 text-muted-foreground/40" />
        <p className="text-sm font-medium">No API keys yet</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Generate a scoped key to call Boardly's public REST API with per-module permissions and
          monthly quotas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {keys.map((key) => {
        const revoked = !!key.revokedAt;
        return (
          <div
            key={key.id}
            className={`flex flex-col gap-4 rounded-2xl border bg-card/80 p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between ${
              revoked ? 'opacity-60' : ''
            }`}
          >
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold">{key.name}</h3>
                <code className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {key.keyPrefix}••••
                </code>
                {revoked && (
                  <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-500">
                    Revoked
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Created{' '}
                  {new Date(key.createdAt).toLocaleDateString()}
                </span>
                <span>
                  Last used:{' '}
                  <strong className="text-foreground">
                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
                  </strong>
                </span>
                <span>
                  Hits this month:{' '}
                  <strong className="text-foreground">{formatNumber(key.hits)}</strong>
                  {key.hitLimit != null ? ` / ${formatNumber(key.hitLimit)}` : ' / unlimited'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {(key.moduleScopes ?? [])
                  .flatMap((scope) => [
                    ...(scope.read ? [`${scope.module}:read`] : []),
                    ...(scope.write ? [`${scope.module}:write`] : []),
                  ])
                  .map((chip) => (
                    <span
                      key={chip}
                      className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary"
                    >
                      {chip}
                    </span>
                  ))}
                {key.moduleScopes?.length === 0 &&
                  key.scopes?.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                      {chip}
                    </span>
                  ))}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
              {!revoked && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  disabled={pendingId === key.id}
                  onClick={() => onRevoke(key)}
                >
                  Revoke
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-rose-500"
                title="Delete key permanently"
                aria-label={`Delete ${key.name}`}
                disabled={pendingId === key.id}
                onClick={() => onDelete(key)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
