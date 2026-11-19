import { useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boardly/ui/select';
import { AlertTriangle } from 'lucide-react';
import { useDialogClose } from '../../hooks/useDialogClose';
import { OutboundBasicsFields } from './OutboundBasicsFields';
import { OutboundAuthFields } from './OutboundAuthFields';
import { OutboundMappingEditor } from './OutboundMappingEditor';
import {
  serializeOutboundDraft,
  validateOutboundDraft,
  type OutboundDraft,
} from './lib/outboundState';

interface Props {
  open: boolean;
  initialDraft: OutboundDraft;
  mode: 'create' | 'edit';
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}

export function OutboundFormDialog({
  open,
  initialDraft,
  mode,
  pending,
  onClose,
  onSubmit,
}: Props) {
  const [draft, setDraft] = useState<OutboundDraft>(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const { handleOpenChange } = useDialogClose({ isOpen: open, onClose });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validateOutboundDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onSubmit(serializeOutboundDraft(draft));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'New outbound integration' : 'Edit integration'}
          </DialogTitle>
          <DialogDescription>
            Boardly calls your endpoint whenever a matching event fires. Secrets are encrypted at
            rest.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="max-h-[68vh] space-y-5 overflow-y-auto pr-1">
            <OutboundBasicsFields draft={draft} onChange={setDraft} />

            <section className="space-y-2.5 border-t pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Data call
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  Auth placeholders: <code>{'{{auth_token}}'}</code>,{' '}
                  <code>{'{{auth_token_2}}'}</code>
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
                <div className="space-y-1.5">
                  <Label htmlFor="data-url" className="text-xs font-medium">
                    URL
                  </Label>
                  <Input
                    id="data-url"
                    value={draft.dataConfig.url}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        dataConfig: { ...draft.dataConfig, url: e.target.value },
                      })
                    }
                    placeholder="https://api.example.com/records"
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Method</Label>
                  <Select
                    value={draft.dataConfig.method}
                    onValueChange={(method) =>
                      setDraft({
                        ...draft,
                        dataConfig: {
                          ...draft.dataConfig,
                          method: method as 'POST' | 'PUT' | 'PATCH',
                        },
                      })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="PATCH">PATCH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="data-headers" className="text-xs font-medium">
                    Headers{' '}
                    <span className="font-normal text-muted-foreground">(one per line)</span>
                  </Label>
                  <textarea
                    id="data-headers"
                    value={draft.dataConfig.headers}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        dataConfig: { ...draft.dataConfig, headers: e.target.value },
                      })
                    }
                    rows={3}
                    placeholder={
                      'authorization: Bearer {{auth_token}}\ncontent-type: application/json'
                    }
                    className="w-full rounded-lg border bg-background px-2.5 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="data-body" className="text-xs font-medium">
                    Body template{' '}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <textarea
                    id="data-body"
                    value={draft.dataConfig.bodyTemplate}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        dataConfig: { ...draft.dataConfig, bodyTemplate: e.target.value },
                      })
                    }
                    rows={3}
                    placeholder="Leave empty to send the mapped JSON payload"
                    className="w-full rounded-lg border bg-background px-2.5 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>
              </div>
            </section>

            <section className="border-t pt-4">
              <OutboundAuthFields draft={draft} onChange={setDraft} />
            </section>

            <section className="border-t pt-4">
              <OutboundMappingEditor
                module={draft.sourceModule}
                mappings={draft.fieldMappings}
                authEnabled={draft.authEnabled}
                onChange={(fieldMappings) => setDraft({ ...draft, fieldMappings })}
              />
            </section>

            <section className="space-y-2.5 border-t pt-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Success check
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Optional. Treat the run as failed unless this response field matches. 5xx and
                  network errors retry twice automatically.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="success-path" className="text-xs font-medium">
                    Response path
                  </Label>
                  <Input
                    id="success-path"
                    value={draft.successCheck.path}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        successCheck: { ...draft.successCheck, path: e.target.value },
                      })
                    }
                    placeholder="status"
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="success-equals" className="text-xs font-medium">
                    Expected value
                  </Label>
                  <Input
                    id="success-equals"
                    value={draft.successCheck.equals}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        successCheck: { ...draft.successCheck, equals: e.target.value },
                      })
                    }
                    placeholder="success"
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>
            </section>
          </div>

          {error && (
            <div
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-[11px] text-destructive"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="text-xs" disabled={pending}>
              {pending ? 'Saving…' : mode === 'create' ? 'Create integration' : 'Save changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
