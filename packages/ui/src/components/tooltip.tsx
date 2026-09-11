import * as React from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { cn } from '../utils';

function TooltipProvider({
  delay = 500,
  closeDelay = 300,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider delay={delay} closeDelay={closeDelay} {...props} />;
}

function TooltipTrigger({
  asChild,
  render,
  children,
  nativeButton,
  ...props
}: TooltipPrimitive.Trigger.Props & { asChild?: boolean }) {
  const isNonButton =
    (React.isValidElement(render) &&
      (typeof render.type !== 'string' || render.type !== 'button')) ||
    (React.isValidElement(children) &&
      (typeof children.type !== 'string' || children.type !== 'button'));

  const resolvedNativeButton =
    nativeButton !== undefined ? nativeButton : isNonButton ? false : undefined;

  if ((asChild || React.isValidElement(children)) && !render) {
    return (
      <TooltipPrimitive.Trigger
        data-slot="tooltip-trigger"
        render={children as React.ReactElement<any>}
        nativeButton={resolvedNativeButton}
        {...props}
      />
    );
  }

  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      render={render}
      nativeButton={resolvedNativeButton}
      {...props}
    >
      {children}
    </TooltipPrimitive.Trigger>
  );
}

function TooltipContent({
  className,
  side = 'top',
  sideOffset = 6,
  align = 'center',
  alignOffset = 0,
  children,
  arrow = false,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'> & {
    arrow?: boolean;
  }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            'z-50 max-w-xs origin-(--transform-origin) overflow-hidden rounded-md bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md ring-1 ring-border/80 backdrop-blur-xs select-none duration-150 outline-none data-[side=bottom]:slide-in-from-top-1 data-[side=inline-end]:slide-in-from-left-1 data-[side=inline-start]:slide-in-from-right-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95',
            className
          )}
          {...props}
        >
          {children}
          {arrow && <TooltipPrimitive.Arrow className="fill-popover" />}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

interface TooltipRootProps extends TooltipPrimitive.Root.Props {
  content?: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left' | 'inline-start' | 'inline-end';
  sideOffset?: number;
  align?: 'start' | 'center' | 'end';
  alignOffset?: number;
  contentClassName?: string;
  arrow?: boolean;
  asChild?: boolean;
}

function TooltipRoot({
  content,
  children,
  side = 'top',
  sideOffset = 6,
  align = 'center',
  alignOffset = 0,
  contentClassName,
  arrow = false,
  asChild = true,
  ...rootProps
}: TooltipRootProps) {
  if (content !== undefined && content !== null && content !== false && content !== '') {
    return (
      <TooltipPrimitive.Root data-slot="tooltip" {...rootProps}>
        <TooltipTrigger asChild={asChild}>{children}</TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={sideOffset}
          align={align}
          alignOffset={alignOffset}
          className={contentClassName}
          arrow={arrow}
        >
          {content}
        </TooltipContent>
      </TooltipPrimitive.Root>
    );
  }

  return (
    <TooltipPrimitive.Root data-slot="tooltip" {...rootProps}>
      {children}
    </TooltipPrimitive.Root>
  );
}

export {
  TooltipProvider,
  TooltipRoot as Tooltip,
  TooltipRoot as Title,
  TooltipTrigger,
  TooltipContent,
};
export type { TooltipRootProps as TooltipProps };
