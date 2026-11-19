import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { Switch } from '@boardly/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boardly/ui/select';
import { API_MODULES, getOutboundTriggers, type ApiModuleId } from '@boardly/shared-types';
import type { OutboundDraft } from './lib/outboundState';
import { setSourceModule, supportsMoveFilter, toggleTrigger } from './lib/outboundState';

interface Props {
  draft: OutboundDraft;
  onChange: (draft: OutboundDraft) => void;
}

export function OutboundBasicsFields({ draft, onChange }: Props) {
  const triggers = getOutboundTriggers(draft.sourceModule);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="outbound-name" className="text-xs font-medium">
            Name
          </Label>
          <Input
            id="outbound-name"
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="e.g. Sync cards to Attio"
            className="h-9 text-sm"
            autoFocus
          />
        </div>
        <div className="flex items-end gap-2 pb-1.5">
          <Switch
            id="outbound-active"
            checked={draft.isActive}
            onCheckedChange={(isActive) => onChange({ ...draft, isActive })}
          />
          <Label htmlFor="outbound-active" className="text-xs text-muted-foreground">
            {draft.isActive ? 'Active' : 'Paused'}
          </Label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Source module</Label>
          <Select
            value={draft.sourceModule}
            onValueChange={(value) => onChange(setSourceModule(draft, value as ApiModuleId))}
          >
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {API_MODULES.map((module) => (
                <SelectItem key={module.id} value={module.id}>
                  {module.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Runs on</Label>
          <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-1.5">
            {triggers.map((trigger) => (
              <label key={trigger.id} className="flex cursor-pointer items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={draft.triggerEvents.includes(trigger.id)}
                  onChange={(e) => onChange(toggleTrigger(draft, trigger.id, e.target.checked))}
                />
                {trigger.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {supportsMoveFilter(draft) && (
        <div className="grid gap-3 rounded-xl border bg-muted/20 p-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="outbound-list-filter" className="text-xs font-medium">
              Only when moved to list{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="outbound-list-filter"
              value={draft.triggerFilter.listId ?? ''}
              onChange={(e) =>
                onChange({
                  ...draft,
                  triggerFilter: { ...draft.triggerFilter, listId: e.target.value.trim() },
                })
              }
              placeholder="List UUID"
              className="h-8 font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="outbound-stage-filter" className="text-xs font-medium">
              Only when stage is{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="outbound-stage-filter"
              value={draft.triggerFilter.stageId ?? ''}
              onChange={(e) =>
                onChange({
                  ...draft,
                  triggerFilter: { ...draft.triggerFilter, stageId: e.target.value.trim() },
                })
              }
              placeholder="Stage UUID"
              className="h-8 font-mono text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}
