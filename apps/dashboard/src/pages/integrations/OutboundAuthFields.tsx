import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { Switch } from '@boardly/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boardly/ui/select';
import { CheckCircle2, FlaskConical, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { testAuthCall } from './lib/integrationsApi';
import { parseHeaders, type OutboundDraft } from './lib/outboundState';

interface Props {
  draft: OutboundDraft;
  onChange: (draft: OutboundDraft) => void;
}

interface AuthTestResult {
  ok: boolean;
  status: number;
  tokenPreview: string | null;
  hasSecondToken: boolean;
  candidatePaths: string[];
  responsePreview: string;
}

export function OutboundAuthFields({ draft, onChange }: Props) {
  const [result, setResult] = useState<AuthTestResult | null>(null);
  const config = draft.authConfig;
  const patch = (patchConfig: Partial<OutboundDraft['authConfig']>) =>
    onChange({ ...draft, authConfig: { ...config, ...patchConfig } });

  const testMutation = useMutation({
    mutationFn: () =>
      testAuthCall({
        url: config.url.trim(),
        method: config.method,
        headers: parseHeaders(config.headers),
        ...(config.method === 'GET' ? {} : { body: config.body || '{}' }),
        tokenPath: config.tokenPath.trim(),
        ...(config.token2Path.trim() ? { token2Path: config.token2Path.trim() } : {}),
      }),
    onSuccess: (data) => setResult(data),
    onError: (err: Error) => toast.error(err.message || 'Auth call failed'),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
        <div className="min-w-0">
          <p className="text-xs font-medium">Auth call</p>
          <p className="text-[11px] text-muted-foreground">
            Exchange credentials for a token, then reuse it for the TTL below.
          </p>
        </div>
        <Switch
          checked={draft.authEnabled}
          aria-label="Enable auth call"
          onCheckedChange={(authEnabled) => onChange({ ...draft, authEnabled })}
        />
      </div>

      {draft.authEnabled && (
        <div className="space-y-3 rounded-xl border bg-muted/10 p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
            <div className="space-y-1.5">
              <Label htmlFor="auth-url" className="text-xs font-medium">
                Auth URL
              </Label>
              <Input
                id="auth-url"
                value={config.url}
                onChange={(e) => patch({ url: e.target.value })}
                placeholder="https://api.example.com/oauth/token"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Method</Label>
              <Select
                value={config.method}
                onValueChange={(method) => patch({ method: method as 'POST' | 'GET' })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="auth-token-path" className="text-xs font-medium">
                Token path
              </Label>
              <Input
                id="auth-token-path"
                value={config.tokenPath}
                onChange={(e) => patch({ tokenPath: e.target.value })}
                placeholder="data.access_token"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auth-token2-path" className="text-xs font-medium">
                Second token path <span className="font-normal text-muted-foreground">(opt.)</span>
              </Label>
              <Input
                id="auth-token2-path"
                value={config.token2Path}
                onChange={(e) => patch({ token2Path: e.target.value })}
                placeholder="data.refresh_token"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auth-ttl" className="text-xs font-medium">
                Cache TTL (seconds)
              </Label>
              <Input
                id="auth-ttl"
                type="number"
                min={30}
                value={config.ttlSeconds}
                onChange={(e) => patch({ ttlSeconds: Number(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="auth-headers" className="text-xs font-medium">
                Headers <span className="font-normal text-muted-foreground">(one per line)</span>
              </Label>
              <textarea
                id="auth-headers"
                value={config.headers}
                onChange={(e) => patch({ headers: e.target.value })}
                rows={3}
                placeholder={'content-type: application/json\nx-client-id: …'}
                className="w-full rounded-lg border bg-background px-2.5 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auth-body" className="text-xs font-medium">
                Request body
              </Label>
              <textarea
                id="auth-body"
                value={config.body}
                onChange={(e) => patch({ body: e.target.value })}
                rows={3}
                placeholder='{"grant_type":"client_credentials"}'
                className="w-full rounded-lg border bg-background px-2.5 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-[11px]"
              disabled={!config.url.trim() || testMutation.isPending}
              onClick={() => testMutation.mutate()}
            >
              <FlaskConical className="h-3.5 w-3.5" />
              {testMutation.isPending ? 'Calling…' : 'Test auth call'}
            </Button>
            {result && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  result.ok
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                }`}
              >
                {result.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                HTTP {result.status}
                {result.tokenPreview ? ` · ${result.tokenPreview}` : ' · no token found'}
                {result.hasSecondToken ? ' · 2 tokens' : ''}
              </span>
            )}
          </div>

          {result && !result.tokenPreview && result.candidatePaths.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground">
                Detected string fields — pick one as the token path:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.candidatePaths.map((path) => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => patch({ tokenPath: path })}
                    className="rounded-md border bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  >
                    {path}
                  </button>
                ))}
              </div>
            </div>
          )}
          {result && !result.ok && result.responsePreview && (
            <pre className="max-h-24 overflow-auto rounded-lg bg-muted p-2 text-[10px] text-muted-foreground">
              {result.responsePreview}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
