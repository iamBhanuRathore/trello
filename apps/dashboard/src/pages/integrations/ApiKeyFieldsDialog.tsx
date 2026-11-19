import { getApiModule } from '@boardly/shared-types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@boardly/ui/dialog';
import { Button } from '@boardly/ui/button';
import { useDialogClose } from '../../hooks/useDialogClose';
import type { ScopeDraft } from './lib/scopeState';
import { toggleModuleField } from './lib/scopeState';

interface Props {
  open: boolean;
  draft: ScopeDraft | null;
  onClose: () => void;
  onChange: (drafts: ScopeDraft[]) => void;
  drafts: ScopeDraft[];
}

export function ApiKeyFieldsDialog({ open, draft, onClose, onChange, drafts }: Props) {
  const { handleOpenChange } = useDialogClose({ isOpen: open, onClose });
  const definition = draft ? getApiModule(draft.module) : null;
  const selected = draft?.fields ?? definition?.fields.map((f) => f.id) ?? [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>{definition?.label ?? 'Fields'} access</DialogTitle>
          <DialogDescription>
            Choose which fields this key may read or write. Required fields stay locked.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-1 overflow-y-auto py-2">
          {definition?.fields.map((field) => {
            const locked = field.requiredOnCreate && !!draft?.write;
            const checked = selected.includes(field.id);
            return (
              <label
                key={field.id}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-transparent px-2 py-1.5 text-xs hover:border-border hover:bg-muted/40"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={checked}
                    disabled={locked}
                    onChange={(e) =>
                      draft &&
                      onChange(toggleModuleField(drafts, draft.module, field.id, e.target.checked))
                    }
                  />
                  <span className="font-medium">{field.label}</span>
                  <code className="text-[10px] text-muted-foreground">{field.id}</code>
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {field.readOnly && <span>read-only</span>}
                  {locked && <span>required</span>}
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex justify-end border-t pt-3">
          <Button size="sm" variant="outline" className="text-xs" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
