import React from 'react';
import { Button } from '@boardly/ui/button';
import { Star } from 'lucide-react';
import { useDialogClose } from '../../../hooks/useDialogClose';
import { toast } from 'sonner';

interface TaskRateModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId: string;
  userRating: number;
  onRatingChange: (rating: number) => void;
}

export const TaskRateModal: React.FC<TaskRateModalProps> = ({
  isOpen,
  onClose,
  cardId,
  userRating,
  onRatingChange,
}) => {
  const { requestClose, handleOverlayClick } = useDialogClose({
    isOpen,
    onClose,
  });

  if (!isOpen) return null;

  return (
    <div
      className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full space-y-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <h3 className="font-bold text-foreground text-base">Rate Task Quality</h3>
          <p className="text-xs text-muted-foreground">
            Score the delivery quality or clarity of this task item.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 py-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => onRatingChange(star)}
              className="p-1 hover:scale-125 transition-transform cursor-pointer"
            >
              <Star
                className={`w-6 h-6 ${
                  star <= userRating
                    ? 'text-amber-500 fill-amber-500'
                    : 'text-muted-foreground hover:text-amber-400'
                }`}
              />
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs cursor-pointer"
            onClick={requestClose}
          >
            Close
          </Button>
          <Button
            size="sm"
            className="text-xs cursor-pointer"
            onClick={() => {
              try {
                localStorage.setItem(`task-rating-${cardId}`, String(userRating));
              } catch {
                // ignore
              }
              toast.success(`Rated ${userRating} stars!`);
              requestClose();
            }}
          >
            Save Rating
          </Button>
        </div>
      </div>
    </div>
  );
};
