import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { orgService, type OrgMember } from '../../../../lib/orgService';
import { useDialogClose } from '../../../../hooks/useDialogClose';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@boardly/ui/dialog';
import { Button } from '@boardly/ui/button';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface RemoveMemberDialogProps {
  isOpen: boolean;
  onClose: () => void;
  member: OrgMember | null;
  orgId: string;
  onRemoved?: () => void;
}

export const RemoveMemberDialog: React.FC<RemoveMemberDialogProps> = ({
  isOpen,
  onClose,
  member,
  orgId,
  onRemoved,
}) => {
  const queryClient = useQueryClient();

  const { handleOpenChange } = useDialogClose({
    isOpen,
    onClose,
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => orgService.removeMember(orgId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgMembers', orgId] });
      toast.success('Member removed from organization');
      onRemoved?.();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to remove member');
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md p-5 bg-card border border-border rounded-2xl shadow-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            <DialogTitle className="text-base font-bold text-foreground">
              Remove Member from Organization
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Are you sure you want to remove{' '}
            <span className="font-semibold text-foreground">{member?.name}</span>? This will revoke
            their organization membership.
          </p>
        </DialogHeader>

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={removeMemberMutation.isPending}
            onClick={() => {
              if (!member) return;
              removeMemberMutation.mutate(member.id);
            }}
          >
            Remove Member
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
