import { API_MODULES } from '@boardly/shared-types';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Switch } from '@boardly/ui/switch';
import { SlidersHorizontal } from 'lucide-react';
import type { ScopeDraft } from './lib/scopeState';
import { toggleModuleScope } from './lib/scopeState';

interface Props {
  drafts: ScopeDraft[];
  onChange: (drafts: ScopeDraft[]) => void;
  onEditFields: (module: string) => void;
}

export function ApiKeyScopeMatrix({ drafts, onChange, onEditFields }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="hidden grid-cols-[1fr_repeat(2,72px)_1fr_88px] gap-2 border-b bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
        <span>Module</span>
        <span className="text-center">Read</span>
        <span className="text-center">Write</span>
        <span>Monthly limit</span>
        <span className="text-right">Fields</span>
      </div>
      {API_MODULES.map((module, index) => {
        const draft = drafts.find((d) => d.module === module.id)!;
        const fieldCount = draft.fields?.length ?? module.fields.length;
        return (
          <div
            key={module.id}
            className={`grid grid-cols-1 gap-3 px-3 py-3 sm:grid-cols-[1fr_repeat(2,72px)_1fr_88px] sm:items-center sm:gap-2 ${
              index % 2 ? 'bg-muted/10' : ''
            }`}
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold">{module.label}</p>
              <p className="truncate text-[11px] text-muted-foreground">{module.description}</p>
            </div>
            <label className="flex items-center justify-between gap-2 text-xs sm:justify-center">
              <span className="sm:hidden">Read</span>
              <input
                type="checkbox"
                aria-label={`${module.label} read access`}
                className="h-4 w-4 accent-primary"
                checked={draft.read}
                onChange={(e) =>
                  onChange(toggleModuleScope(drafts, module.id, 'read', e.target.checked))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-xs sm:justify-center">
              <span className="sm:hidden">Write</span>
              <input
                type="checkbox"
                aria-label={`${module.label} write access`}
                className="h-4 w-4 accent-primary"
                checked={draft.write}
                onChange={(e) =>
                  onChange(toggleModuleScope(drafts, module.id, 'write', e.target.checked))
                }
              />
            </label>
            <div className="flex items-center gap-2">
              <Switch
                checked={!draft.unlimited}
                aria-label={`${module.label} monthly limit`}
                onCheckedChange={(limited) =>
                  onChange(
                    drafts.map((d) =>
                      d.module === module.id
                        ? {
                            ...d,
                            unlimited: !limited,
                            hitLimit: limited ? (d.hitLimit ?? 1000) : null,
                          }
                        : d
                    )
                  )
                }
              />
              {draft.unlimited ? (
                <span className="text-[11px] text-muted-foreground">Unlimited</span>
              ) : (
                <Input
                  type="number"
                  min={0}
                  aria-label={`${module.label} monthly hit limit`}
                  className="h-8 w-24 text-xs"
                  value={draft.hitLimit ?? 1000}
                  onChange={(e) =>
                    onChange(
                      drafts.map((d) =>
                        d.module === module.id ? { ...d, hitLimit: Number(e.target.value) } : d
                      )
                    )
                  }
                />
              )}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-[11px]"
                onClick={() => onEditFields(module.id)}
                disabled={!draft.read && !draft.write}
                title={!draft.read && !draft.write ? 'Enable read or write first' : 'Choose fields'}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {fieldCount}/{module.fields.length}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
