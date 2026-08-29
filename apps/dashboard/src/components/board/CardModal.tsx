import { useRef } from 'react';
import { Dialog, DialogContent } from '@boardly/ui/dialog';
import { TaskDetailView, type TaskDetailViewHandle } from './TaskDetailView';

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

  if (!cardId) return null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (taskDetailRef.current) {
        taskDetailRef.current.requestClose();
      } else {
        onOpenChange(false);
      }
    } else {
      onOpenChange(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-5xl md:max-w-6xl w-[94vw] h-[88vh] max-h-[88vh] p-0 bg-card rounded-2xl border border-border overflow-hidden flex flex-col shadow-2xl"
        showCloseButton={false}
      >
        <TaskDetailView
          ref={taskDetailRef}
          cardId={cardId}
          mode="modal"
          onClose={() => onOpenChange(false)}
          onSelectCard={onSelectCard}
        />
      </DialogContent>
    </Dialog>
  );
}
