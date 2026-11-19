import { useMemo, useState } from 'react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { Switch } from '@boardly/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boardly/ui/select';
import { KeyRound } from 'lucide-react';
import { ApiKeyScopeMatrix } from './ApiKeyScopeMatrix';
import { ApiKeyFieldsDialog } from './ApiKeyFieldsDialog';
import type { ScopeDraft } from './lib/scopeState';
import {
  configuredModuleCount,
  emptyScopeDrafts,
  isScopeValid,
  serializeScopeDrafts,
} from './lib/scopeState';
import type { CreateApiKeyBody } from './lib/integrationsApi';

interface Props {
  pending: boolean;
  onCreate: (body: CreateApiKeyBody) => void;
  onCancel: () => void;
}

export function ApiKeyCreateForm({ pending, onCreate, onCancel }: Props) {
  const [name, setName] = useState('');
  const [drafts, setDrafts] = useState<ScopeDraft[]>(emptyScopeDrafts);
  const [unlimited, setUnlimited] = useState(true);
  const [hitLimit, setHitLimit] = useState(10000);
  const [expires, setExpires] = useState('90');
  const [fieldsModule, setFieldsModule] = useState<string | null>(null);

  const configured = useMemo(() => configuredModuleCount(drafts), [drafts]);
  const valid = name.trim().length > 0 && isScopeValid(drafts);
  const activeDraft = drafts.find((d) => d.module === fieldsModule) ?? null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    onCreate({
      name: name.trim(),
      hitLimit: unlimited ? null : hitLimit,
      moduleScopes: serializeScopeDrafts(drafts),
      expiresInDays: expires ? Number(expires) : undefined,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="api-key-name" className="text-xs font-medium">
            Key name
          </Label>
          <Input
            id="api-key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Production automations"
            className="h-9 text-sm"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Global monthly limit</Label>
          <div className="flex items-center gap-2">
            <Switch
              checked={!unlimited}
              aria-label="Enable global monthly limit"
              onCheckedChange={(limited) => setUnlimited(!limited)}
            />
            {unlimited ? (
              <span className="text-xs text-muted-foreground">Unlimited</span>
            ) : (
              <Input
                type="number"
                min={0}
                value={hitLimit}
                onChange={(e) => setHitLimit(Number(e.target.value))}
                className="h-9 w-28 text-xs"
                aria-label="Global monthly hit limit"
              />
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Expiration</Label>
          <Select value={expires} onValueChange={setExpires}>
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="60">60 days</SelectItem>
              <SelectItem value="90">90 days (recommended)</SelectItem>
              <SelectItem value="365">1 year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-xs font-medium">Module permissions</Label>
          <span className="text-[11px] text-muted-foreground">
            {configured} of 4 modules configured
          </span>
        </div>
        <ApiKeyScopeMatrix
          drafts={drafts}
          onChange={setDrafts}
          onEditFields={(module) => setFieldsModule(module)}
        />
      </div>

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" className="gap-1.5 text-xs" disabled={!valid || pending}>
          <KeyRound className="h-3.5 w-3.5" />
          {pending ? 'Generating…' : 'Generate key'}
        </Button>
      </div>

      <ApiKeyFieldsDialog
        open={!!fieldsModule}
        draft={activeDraft}
        drafts={drafts}
        onChange={setDrafts}
        onClose={() => setFieldsModule(null)}
      />
    </form>
  );
}
