'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import { cn } from '../utils';
import { Button } from './button';
import { XIcon } from 'lucide-react';

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
  asChild,
  render,
  children,
  ...props
}: DialogPrimitive.Trigger.Props & { asChild?: boolean }) {
  if ((asChild || React.isValidElement(children)) && !render) {
    return (
      <DialogPrimitive.Trigger
        data-slot="dialog-trigger"
        render={children as React.ReactElement<any>}
        {...props}
      />
    );
  }
  // Same non-<button> render-prop handling as DropdownMenuTrigger.
  const renderIsNonButtonElement =
    React.isValidElement(render) && typeof render.type === 'string' && render.type !== 'button';
  const renderProps =
    renderIsNonButtonElement && (props as { nativeButton?: boolean }).nativeButton === undefined
      ? { nativeButton: false as const }
      : null;
  return (
    <DialogPrimitive.Trigger data-slot="dialog-trigger" render={render} {...renderProps} {...props}>
      {children}
    </DialogPrimitive.Trigger>
  );
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 isolate z-50 bg-black/60 duration-100 backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className
      )}
      {...props}
    />
  );
}

type DialogEscapeCloser = () => boolean;

const dialogEscapeStack: Array<DialogEscapeCloser> = [];
let isDialogEscapeListenerAttached = false;

function handleDialogGlobalEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' || e.key === 'Esc') {
    // Walk down from the top, dropping stale entries (unmounted content)
    // until one actually closes something. Stale entries accumulate because
    // DialogContent effects run even for closed always-rendered dialogs.
    while (dialogEscapeStack.length > 0) {
      const topClose = dialogEscapeStack[dialogEscapeStack.length - 1];
      e.preventDefault();
      e.stopPropagation();
      if (topClose?.()) break;
      dialogEscapeStack.pop();
    }
  }
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
}) {
  const internalCloseRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (typeof window !== 'undefined' && !isDialogEscapeListenerAttached) {
      window.addEventListener('keydown', handleDialogGlobalEscape, true);
      isDialogEscapeListenerAttached = true;
    }

    const triggerClose: DialogEscapeCloser = () => {
      // Only a mounted close button can close anything — a null or detached
      // ref means this entry belongs to closed/unmounted content: report it
      // stale so the stack walker drops it and tries the next entry down.
      const el = internalCloseRef.current;
      if (!el || !el.isConnected) return false;
      el.click();
      return true;
    };

    dialogEscapeStack.push(triggerClose);

    return () => {
      const idx = dialogEscapeStack.lastIndexOf(triggerClose);
      if (idx !== -1) {
        dialogEscapeStack.splice(idx, 1);
      }
    };
  }, []);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          ref={internalCloseRef}
          className="sr-only hidden pointer-events-none"
          tabIndex={-1}
          aria-hidden
        />
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-4 right-4 h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors z-50 cursor-pointer p-0 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary/30"
                size="icon-sm"
              />
            }
          >
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>Close</DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('font-heading text-base leading-none font-medium', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
