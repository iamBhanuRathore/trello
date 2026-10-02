import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { KanbanCardView } from './KanbanCardView';
import type { KanbanCard } from './types';

interface SortableCardProps {
  card: KanbanCard;
  isDraggingActive: boolean;
  onClick: () => void;
}

export function SortableCard({ card, isDraggingActive, onClick }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: {
      type: 'card',
      card,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCardView
        card={card}
        isDragging={isDragging}
        isDraggingActive={isDraggingActive}
        onClick={onClick}
      />
    </div>
  );
}
