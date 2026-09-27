import { useRef, useState } from 'react';
import { Dialog, DialogContent } from '@boardly/ui/dialog';
import { TaskDetailView, type TaskDetailViewHandle } from './TaskDetailView';
import { useDialogClose } from '../../hooks/useDialogClose';

export function CardModal({
  cardId,
  open,
  onOpenChange,
  onSelectCard,
}: {
  cardId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectCard?: (id: string) => void;
}) {
  const taskDetailRef = useRef<TaskDetailViewHandle>(null);
  const [isDirty, setIsDirty] = useState(false);

  if (!cardId) return null;

  // One sanctioned close path (idempotent): overlay/Esc/X funnel here.
  // Dirty state lifts from the detail view; the prompt itself stays there.
  const { handleOpenChange } = useDialogClose({
    isOpen: open,
    onClose: () => onOpenChange(false),
    isDirty,
    onDirtyRequest: () => taskDetailRef.current?.requestClose(),
  });

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      // Dirty-aware: the detail view shows its unsaved prompt instead of closing.
      if (taskDetailRef.current) {
        taskDetailRef.current.requestClose();
      } else {
        handleOpenChange(nextOpen);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="sm:max-w-6xl md:max-w-7xl xl:max-w-[1550px] w-[96vw] h-[92vh] max-h-[92vh] p-0 bg-card rounded-2xl border border-border/80 overflow-hidden flex flex-col shadow-2xl"
        showCloseButton={false}
      >
        <TaskDetailView
          ref={taskDetailRef}
          cardId={cardId}
          mode="modal"
          onClose={() => onOpenChange(false)}
          onSelectCard={onSelectCard}
          onDirtyChange={setIsDirty}
        />
      </DialogContent>
    </Dialog>
  );
}
