import { CheckSquare, Forward } from 'lucide-react';

interface SelectModeToolbarProps {
  selectedCount: number;
  onBulkForward: () => void;
  onBulkDelete: () => void;
  onCancel: () => void;
}

export function SelectModeToolbar({
  selectedCount,
  onBulkForward,
  onBulkDelete,
  onCancel,
}: SelectModeToolbarProps) {
  return (
    <div className="mx-4 mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/8 border border-primary/25 shrink-0">
      <CheckSquare className="w-4 h-4 text-primary shrink-0" />
      <span className="text-xs font-semibold">{selectedCount} selected</span>
      <span className="ml-auto flex items-center gap-1">
        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={onBulkForward}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-muted disabled:opacity-40 cursor-pointer"
          title="Forward selected"
        >
          <Forward className="w-3.5 h-3.5" />
          Forward
        </button>
        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={onBulkDelete}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40 cursor-pointer"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
        >
          Cancel
        </button>
      </span>
    </div>
  );
}
