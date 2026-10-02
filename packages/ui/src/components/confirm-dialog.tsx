import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from './dialog';
import { Button } from './button';
import { AlertTriangle, Info, AlertCircle, RotateCcw } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'destructive' | 'warning' | 'success' | 'default';
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading: externalLoading = false,
  onConfirm,
}) => {
  const [internalLoading, setInternalLoading] = useState(false);
  const isLoading = externalLoading || internalLoading;

  const isDestructive = variant === 'destructive';
  const isWarning = variant === 'warning';
  const isSuccess = variant === 'success';

  const handleConfirm = async () => {
    try {
      setInternalLoading(true);
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Error handled by parent or mutation
    } finally {
      setInternalLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-card border border-border/80 rounded-2xl shadow-2xl">
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3.5 pr-6">
            <div
              className={`p-2.5 rounded-xl shrink-0 ${
                isDestructive
                  ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20'
                  : isWarning
                    ? 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20'
                    : isSuccess
                      ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-primary/10 text-primary border border-primary/20'
              }`}
            >
              {isDestructive ? (
                <AlertCircle className="w-5 h-5" />
              ) : isWarning ? (
                <AlertTriangle className="w-5 h-5" />
              ) : isSuccess ? (
                <RotateCcw className="w-5 h-5" />
              ) : (
                <Info className="w-5 h-5" />
              )}
            </div>
            <div className="space-y-1.5 pt-0.5">
              <DialogTitle className="text-base font-bold tracking-tight text-foreground">
                {title}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
                {description}
              </DialogDescription>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 bg-muted/30 border-t border-border/80 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            className="w-full sm:w-auto text-xs font-medium cursor-pointer border-border hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isLoading}
            className={`w-full sm:w-auto text-xs font-semibold cursor-pointer ${
              isDestructive
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xs'
                : isWarning
                  ? 'bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700 shadow-xs'
                  : isSuccess
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 shadow-xs'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs'
            }`}
            onClick={handleConfirm}
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
