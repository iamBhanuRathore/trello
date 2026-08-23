import { Dialog, DialogContent } from '@boardly/ui/dialog';
import { TaskDetailView } from './TaskDetailView';

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
  if (!cardId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-5xl md:max-w-6xl w-[94vw] h-[88vh] max-h-[88vh] p-0 bg-card rounded-2xl border border-border overflow-hidden flex flex-col shadow-2xl"
        showCloseButton={false}
      >
        <TaskDetailView
          cardId={cardId}
          mode="modal"
          onClose={() => onOpenChange(false)}
          onSelectCard={onSelectCard}
        />
      </DialogContent>
    </Dialog>
  );
}
