import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { orgService, type OrgMember } from '../../../../lib/orgService';
import { useDialogClose } from '../../../../hooks/useDialogClose';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@boardly/ui/dialog';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface DeactivateMemberDialogProps {
  isOpen: boolean;
  onClose: () => void;
  member: OrgMember | null;
  orgId: string;
  drawerMemberId?: string | null;
}

export const DeactivateMemberDialog: React.FC<DeactivateMemberDialogProps> = ({
  isOpen,
  onClose,
  member,
  orgId,
  drawerMemberId,
}) => {
  const queryClient = useQueryClient();
  const [deactivationReason, setDeactivationReason] = useState('');

  const { handleOpenChange } = useDialogClose({
    isOpen,
    onClose: () => {
      setDeactivationReason('');
      onClose();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: ({ memberId, reason }: { memberId: string; reason?: string }) =>
      orgService.deactivateMember(orgId, memberId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgMembers', orgId] });
      if (drawerMemberId) {
        queryClient.invalidateQueries({ queryKey: ['memberActivity', orgId, drawerMemberId] });
      }
      setDeactivationReason('');
      toast.success('Member deactivated (soft-delete applied, access revoked)');
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to deactivate member');
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md p-5 bg-card border border-border rounded-2xl shadow-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5" />
            <DialogTitle className="text-base font-bold text-foreground">
              Deactivate Member Account
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Deactivating <span className="font-semibold text-foreground">{member?.name}</span> will
            immediately revoke their access and terminate all active sessions. Their historical data
            (tasks, time logs, comments) will be preserved intact.
          </p>
        </DialogHeader>

        <div className="space-y-2 my-2">
          <Label className="text-xs font-semibold">Reason for Deactivation (Optional)</Label>
          <Input
            placeholder="e.g. Contract ended / Offboarding"
            value={deactivationReason}
            onChange={(e) => setDeactivationReason(e.target.value)}
            className="text-xs bg-background"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={deactivateMutation.isPending}
            onClick={() => {
              if (!member) return;
              deactivateMutation.mutate({
                memberId: member.id,
                reason: deactivationReason,
              });
            }}
          >
            Confirm Deactivation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
