import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { useDialogClose } from '../../hooks/useDialogClose';

const PARAM = 'createWorkspace';

/**
 * Shell-mounted workspace creator (lives in DashboardLayout, next to the
 * sidebar). Opens from `?createWorkspace=1` on ANY route without navigating:
 * the param is consumed with `replace: true`, so opening the dialog never
 * pushes a history entry and Back never lands on a phantom route.
 */
export function GlobalCreateWorkspaceDialog() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get(PARAM) === '1') {
      setOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete(PARAM);
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  if (!open) return null;
  // Hidden wrapper: CreateWorkspaceDialog always renders its DialogTrigger
  // button (used by the Workspaces page); the shell only wants the portal.
  // Single close path (AGENTS.md §11) — requestClose is idempotent per
  // open session, so X / backdrop / Esc cannot double-close.
  const { handleOpenChange } = useDialogClose({
    isOpen: open,
    onClose: () => setOpen(false),
  });

  return (
    <div className="hidden" aria-hidden="true">
      <CreateWorkspaceDialog
        open={open}
        onOpenChange={handleOpenChange}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['workspaces'] });
          queryClient.invalidateQueries({ queryKey: ['workspaces', 'tree'] });
        }}
      />
    </div>
  );
}

/** Set `?createWorkspace=1` on the CURRENT location (replace — no history entry). */
export function useOpenCreateWorkspace(): () => void {
  const [searchParams, setSearchParams] = useSearchParams();
  return () => {
    const next = new URLSearchParams(searchParams);
    next.set(PARAM, '1');
    setSearchParams(next, { replace: true });
  };
}
