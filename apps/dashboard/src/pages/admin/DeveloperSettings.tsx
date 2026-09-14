import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiKeys, createApiKey, revokeApiKey } from '../../lib/api';
import {
  Code,
  Plus,
  Trash2,
  Copy,
  Check,
  Shield,
  Clock,
  Terminal,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@boardly/ui/dialog';
import { QueryError } from '../../components/common/QueryError';

const AVAILABLE_SCOPES = [
  { id: '*', label: 'Full Access (All Scopes)' },
  { id: 'boards:read', label: 'Read Boards & Lists' },
  { id: 'boards:write', label: 'Create & Modify Boards' },
  { id: 'cards:read', label: 'Read Cards & Tasks' },
  { id: 'cards:write', label: 'Create & Update Cards' },
  { id: 'reports:read', label: 'Read Analytics & Timesheets' },
  { id: 'webhooks:manage', label: 'Manage Webhook Subscriptions' },
];

export function DeveloperSettings() {
  const queryClient = useQueryClient();

  const [isCreating, setIsCreating] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['*']);
  const [expiresInDays, setExpiresInDays] = useState<number | ''>(90);

  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const {
    data: keys = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['developerApiKeys'],
    queryFn: () => getApiKeys(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => createApiKey(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['developerApiKeys'] });
      setIsCreating(false);
      setGeneratedKey(res.rawKey);
      setKeyName('');
      setSelectedScopes(['*']);
      setExpiresInDays(90);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['developerApiKeys'] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    createMutation.mutate({
      name: keyName.trim(),
      scopes: selectedScopes,
      expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
    });
  };

  const toggleScope = (scopeId: string) => {
    if (scopeId === '*') {
      setSelectedScopes(['*']);
      return;
    }

    const withoutAll = selectedScopes.filter((s) => s !== '*');
    if (withoutAll.includes(scopeId)) {
      const next = withoutAll.filter((s) => s !== scopeId);
      setSelectedScopes(next.length === 0 ? ['*'] : next);
    } else {
      setSelectedScopes([...withoutAll, scopeId]);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading developer keys...</p>
        </div>
      </div>
    );
  }

  if (isError && keys.length === 0) {
    return (
      <div className="max-w-5xl mx-auto py-8">
        <QueryError
          message="Couldn't load API keys. Check your connection and try again."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Code className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Public Developer API Keys</h1>
            <p className="text-sm text-muted-foreground">
              Generate scoped API secret keys for automation scripts, CI/CD pipelines, and custom
              integrations.
            </p>
          </div>
        </div>

        <Button onClick={() => setIsCreating(true)} className="gap-2 text-xs h-9">
          <Plus className="w-4 h-4" /> Generate New API Key
        </Button>
      </div>

      {/* Keys List */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Active API Keys ({keys.length})
        </h2>

        {keys.length > 0 ? (
          <div className="space-y-3">
            {keys.map((k: any) => (
              <div
                key={k.id}
                className="p-5 rounded-2xl border bg-card/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-primary/40 transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-semibold text-sm">{k.name}</h3>
                    <code className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-muted text-muted-foreground">
                      {k.keyPrefix}••••••••
                    </code>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Created{' '}
                      {new Date(k.createdAt).toLocaleDateString()}
                    </span>
                    <span>•</span>
                    <span>
                      Last used:{' '}
                      <strong className="text-foreground">
                        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
                      </strong>
                    </span>
                    {k.expiresAt && (
                      <>
                        <span>•</span>
                        <span className="text-amber-500">
                          Expires {new Date(k.expiresAt).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {k.scopes?.map((s: string) => (
                      <span
                        key={s}
                        className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-purple-500/10 text-purple-500 border border-purple-500/20"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-rose-500"
                  onClick={() => revokeMutation.mutate(k.id)}
                  title="Revoke Key"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-muted-foreground border rounded-2xl bg-muted/10 space-y-2">
            <Shield className="w-6 h-6 mx-auto text-muted-foreground/40" />
            <p className="font-medium">No developer API keys active.</p>
            <p className="text-[11px]">
              Generate a key to authenticate requests with Boardly REST APIs.
            </p>
          </div>
        )}
      </div>

      {/* Code Example Snippet */}
      <div className="p-6 rounded-2xl border bg-slate-950 text-slate-100 shadow-xl space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <Terminal className="w-4 h-4 text-primary" /> Authenticating REST Requests
        </div>
        <pre className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">
          {`curl -X GET https://api.boardly.com/v1/cards?listId=LIST_ID \\
  -H "Authorization: Bearer bk_live_xxxxxxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json"`}
        </pre>
      </div>

      {/* CREATE API KEY DIALOG */}
      <Dialog open={isCreating} onOpenChange={(open) => !open && setIsCreating(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Developer API Key</DialogTitle>
            <DialogDescription>
              Create a cryptographic token for script and API access.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Key Name / Description</Label>
              <Input
                placeholder="e.g. GitHub Actions Sync, Analytics Exporter"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                required
                className="text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Expiration Period</Label>
              <select
                value={expiresInDays}
                onChange={(e) =>
                  setExpiresInDays(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="w-full h-9 rounded-lg border bg-background px-3 text-xs focus:ring-1 focus:ring-primary"
              >
                <option value={30}>30 Days</option>
                <option value={60}>60 Days</option>
                <option value={90}>90 Days (Recommended)</option>
                <option value={365}>1 Year</option>
                <option value="">Never Expires</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Allowed Scopes</Label>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto p-1 border rounded-xl bg-muted/10">
                {AVAILABLE_SCOPES.map((scope) => {
                  const isChecked = selectedScopes.includes(scope.id);
                  return (
                    <div
                      key={scope.id}
                      onClick={() => toggleScope(scope.id)}
                      className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                        isChecked
                          ? 'border-primary bg-primary/5 text-foreground'
                          : 'hover:bg-muted/40 text-muted-foreground'
                      }`}
                    >
                      <span className="font-mono text-[11px]">{scope.id}</span>
                      <span className="text-[11px]">{scope.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsCreating(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createMutation.isPending || !keyName.trim()}
                className="text-xs"
              >
                {createMutation.isPending ? 'Generating...' : 'Create API Key'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* REVEAL SECRET KEY DIALOG */}
      <Dialog open={!!generatedKey} onOpenChange={(open) => !open && setGeneratedKey(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-500">
              <Check className="w-5 h-5" /> API Key Created
            </DialogTitle>
            <DialogDescription>
              Copy your secret key now. For security purposes, it will never be displayed again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Store this key securely. Anyone with this token can execute requests on behalf of
                your team.
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={generatedKey || ''}
                className="text-xs h-10 font-mono bg-muted/50"
              />
              <Button
                size="sm"
                className="h-10 text-xs gap-1.5 px-4"
                onClick={() => copyToClipboard(generatedKey || '')}
              >
                {copiedKey ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> Copy
                  </>
                )}
              </Button>
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setGeneratedKey(null)} className="text-xs">
                I Have Saved My Secret Key
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
