import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { orgService, type OrgMember } from '../../../../lib/orgService';
import { useDialogClose } from '../../../../hooks/useDialogClose';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@boardly/ui/dialog';
import { Button } from '@boardly/ui/button';
import { Shield } from 'lucide-react';
import { toast } from 'sonner';
import { ROLE_DESCRIPTIONS } from '../types';

interface ChangeRoleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  member: OrgMember | null;
  orgId: string;
}

export const ChangeRoleDialog: React.FC<ChangeRoleDialogProps> = ({
  isOpen,
  onClose,
  member,
  orgId,
}) => {
  const queryClient = useQueryClient();
  const [newRole, setNewRole] = useState(member?.role || 'member');

  useEffect(() => {
    if (member) {
      setNewRole(member.role);
    }
  }, [member]);

  const { handleOpenChange } = useDialogClose({
    isOpen,
    onClose,
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: string }) =>
      orgService.updateMemberRole(orgId, memberId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgMembers', orgId] });
      toast.success('Member role updated successfully');
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to update role');
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md p-5 bg-card border border-border rounded-2xl shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground">
            Modify Organization Role
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select new security privilege level for{' '}
            <span className="font-semibold text-foreground">{member?.name}</span>.
          </p>
        </DialogHeader>

        <div className="space-y-3 my-3">
          {['org_owner', 'org_admin', 'member', 'viewer'].map((r) => {
            const isSelected = newRole === r;
            const config = ROLE_DESCRIPTIONS[r] || { title: r, description: '', icon: Shield };
            const Icon = config.icon;
            return (
              <div
                key={r}
                onClick={() => setNewRole(r)}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  isSelected
                    ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary/20'
                    : 'border-border bg-background hover:bg-muted/40 text-muted-foreground'
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${isSelected ? 'bg-primary/10 text-primary' : 'bg-muted'}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-foreground">{config.title}</div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    {config.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={updateRoleMutation.isPending}
            onClick={() => {
              if (!member) return;
              updateRoleMutation.mutate({ memberId: member.id, role: newRole });
            }}
          >
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
