import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { orgService } from '../../../../lib/orgService';
import { useDialogClose } from '../../../../hooks/useDialogClose';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@boardly/ui/dialog';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boardly/ui/select';
import {
  Shield,
  Briefcase,
  RefreshCw,
  Send,
  FileSpreadsheet,
  CheckCircle2,
  Mail,
  Check,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { ROLE_DESCRIPTIONS } from '../types';

interface InviteMemberDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  workspaces: Array<{ id: string; name: string }>;
}

export const InviteMemberDialog: React.FC<InviteMemberDialogProps> = ({
  isOpen,
  onClose,
  orgId,
  workspaces,
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [inviteModalTab, setInviteModalTab] = useState<'single' | 'bulk'>('single');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>([]);
  const [bulkText, setBulkText] = useState('');
  const [bulkRole, setBulkRole] = useState('member');
  const [invitedSuccessData, setInvitedSuccessData] = useState<{
    inviteToken?: string;
    count?: number;
  } | null>(null);
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);

  const resetForm = () => {
    setInvitedSuccessData(null);
    setInviteName('');
    setInviteEmail('');
    setInviteRole('member');
    setSelectedWorkspaceIds([]);
    setBulkText('');
    setCopiedInviteLink(false);
  };

  const { handleOpenChange } = useDialogClose({
    isOpen,
    onClose: () => {
      resetForm();
      onClose();
    },
  });

  const singleInviteMutation = useMutation({
    mutationFn: () =>
      orgService.inviteMember(orgId, {
        email: inviteEmail.trim(),
        role: inviteRole,
        name: inviteName.trim() || undefined,
        workspaceIds: selectedWorkspaceIds.length > 0 ? selectedWorkspaceIds : undefined,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orgMembers', orgId] });
      queryClient.invalidateQueries({ queryKey: ['orgInvitations', orgId] });
      setInvitedSuccessData({ inviteToken: data.inviteToken, count: 1 });
      toast.success(`Invitation generated for ${inviteEmail.trim()}`);
    },
    onError: (err: any) => {
      const isBillingError =
        err.response?.status === 402 || err.response?.data?.code === 'PLAN_UPGRADE_REQUIRED';
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to invite user';
      if (isBillingError) {
        toast.error(msg, {
          action: {
            label: 'Manage Seats',
            onClick: () => navigate('/admin/billing'),
          },
          duration: 8000,
        });
      } else {
        toast.error(msg);
      }
    },
  });

  const bulkInviteMutation = useMutation({
    mutationFn: (invites: Array<{ email: string; name?: string; role?: string }>) =>
      orgService.bulkInviteMembers(orgId, invites),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orgMembers', orgId] });
      queryClient.invalidateQueries({ queryKey: ['orgInvitations', orgId] });
      setInvitedSuccessData({ count: data.successfulCount });
      toast.success(
        `Successfully onboarded ${data.successfulCount} members (${data.failedCount} failed)`
      );
    },
    onError: (err: any) => {
      const isBillingError =
        err.response?.status === 402 || err.response?.data?.code === 'PLAN_UPGRADE_REQUIRED';
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Bulk invite failed';
      if (isBillingError) {
        toast.error(msg, {
          action: {
            label: 'Manage Seats',
            onClick: () => navigate('/admin/billing'),
          },
          duration: 8000,
        });
      } else {
        toast.error(msg);
      }
    },
  });

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim()) return;

    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const parsedInvites: Array<{ email: string; name?: string; role?: string }> = [];

    for (const line of lines) {
      if (line.includes(',')) {
        const parts = line.split(',').map((p) => p.trim());
        const email = parts[0]!;
        const name = parts[1] || undefined;
        const role = parts[2] || bulkRole;
        if (email.includes('@')) {
          parsedInvites.push({ email, name, role });
        }
      } else {
        if (line.includes('@')) {
          parsedInvites.push({ email: line, role: bulkRole });
        }
      }
    }

    if (parsedInvites.length === 0) {
      toast.error('No valid email addresses detected. Please check formatting.');
      return;
    }

    bulkInviteMutation.mutate(parsedInvites);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden bg-card border border-border rounded-2xl shadow-2xl">
        <DialogHeader className="p-5 border-b border-border bg-muted/20">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Onboard New Team Members
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Provision member accounts, assign roles, and configure workspace access.
              </p>
            </div>
          </div>

          {!invitedSuccessData && (
            <div className="flex items-center gap-2 mt-4 bg-muted/50 p-1 rounded-lg border border-border/50">
              <button
                type="button"
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  inviteModalTab === 'single'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setInviteModalTab('single')}
              >
                Single Member Invite
              </button>
              <button
                type="button"
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  inviteModalTab === 'bulk'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setInviteModalTab('bulk')}
              >
                Bulk Onboarding (CSV / Multi)
              </button>
            </div>
          )}
        </DialogHeader>

        {!invitedSuccessData ? (
          inviteModalTab === 'single' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!inviteEmail) return;
                singleInviteMutation.mutate();
              }}
              className="p-5 space-y-4"
            >
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Full Name</Label>
                <Input
                  placeholder="e.g. Elena Rostova"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="bg-background text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Email Address *</Label>
                <Input
                  required
                  type="email"
                  placeholder="name@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="bg-background text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Organization Role</Label>
                <div className="grid grid-cols-3 gap-2">
                  {['org_admin', 'member', 'viewer'].map((r) => {
                    const isSelected = inviteRole === r;
                    const config = ROLE_DESCRIPTIONS[r] || { title: r, icon: Shield };
                    const Icon = config.icon;
                    return (
                      <div
                        key={r}
                        onClick={() => setInviteRole(r)}
                        className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary/20'
                            : 'border-border bg-background hover:bg-muted/50 text-muted-foreground'
                        }`}
                      >
                        <Icon className="w-4 h-4 mx-auto mb-1" />
                        <div className="font-semibold text-xs text-foreground">{config.title}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {workspaces.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Assign Initial Workspaces</Label>
                  <div className="max-h-32 overflow-y-auto space-y-1.5 p-2 rounded-xl border bg-muted/20">
                    {workspaces.map((ws) => {
                      const isChecked = selectedWorkspaceIds.includes(ws.id);
                      return (
                        <label
                          key={ws.id}
                          className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:bg-background/80 p-1.5 rounded-lg transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedWorkspaceIds([...selectedWorkspaceIds, ws.id]);
                              } else {
                                setSelectedWorkspaceIds(
                                  selectedWorkspaceIds.filter((id) => id !== ws.id)
                                );
                              }
                            }}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                          <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="font-medium truncate">{ws.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    resetForm();
                    onClose();
                  }}
                  size="sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={singleInviteMutation.isPending}
                  className="gap-2"
                >
                  {singleInviteMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Send Onboarding Invite</span>
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleBulkSubmit} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Paste Emails or CSV List</Label>
                  <span className="text-[11px] text-muted-foreground">
                    Format: email, name, role
                  </span>
                </div>
                <textarea
                  rows={6}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={`alex@acme.corp, Alex Vance, org_admin\nelena@acme.corp, Elena Rostova, member\nmarcus@acme.corp, Marcus Brody, member`}
                  className="w-full text-xs font-mono p-3 rounded-xl border bg-background text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border">
                <div className="text-xs">
                  <span className="font-semibold text-foreground">Default Fallback Role:</span>
                  <span className="text-muted-foreground ml-1">Applies if role is omitted</span>
                </div>
                <Select value={bulkRole} onValueChange={setBulkRole}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="org_admin">Org Admin</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    resetForm();
                    onClose();
                  }}
                  size="sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={bulkInviteMutation.isPending}
                  className="gap-2"
                >
                  {bulkInviteMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  )}
                  <span>Process Bulk Onboarding</span>
                </Button>
              </div>
            </form>
          )
        ) : (
          <div className="p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {invitedSuccessData.count && invitedSuccessData.count > 1
                  ? `${invitedSuccessData.count} Invitations Sent`
                  : 'Invitation Email Sent ✉️'}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">
                {invitedSuccessData.count && invitedSuccessData.count > 1
                  ? `${invitedSuccessData.count} personalized invitation emails have been sent. Members will set up their accounts through a secure onboarding link.`
                  : "A personalized invitation email has been sent. They'll receive a secure link to set up their account and join your organization."}
              </p>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-400 font-medium">
              <Mail className="w-3.5 h-3.5" />
              Invitation email dispatched
            </div>

            {invitedSuccessData.inviteToken && (
              <details className="text-left mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  Show backup invite link
                </summary>
                <div className="flex items-center gap-2 p-2 rounded-xl border bg-muted/40 mt-2">
                  <input
                    readOnly
                    value={`${window.location.origin}/invite?token=${invitedSuccessData.inviteToken}`}
                    className="text-xs bg-transparent border-none focus:outline-none flex-1 text-muted-foreground font-mono truncate"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs gap-1 shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/invite?token=${invitedSuccessData!.inviteToken}`
                      );
                      setCopiedInviteLink(true);
                      toast.success('Link copied to clipboard!');
                    }}
                  >
                    {copiedInviteLink ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedInviteLink ? 'Copied' : 'Copy'}</span>
                  </Button>
                </div>
              </details>
            )}

            <div className="pt-2">
              <Button
                onClick={() => {
                  resetForm();
                  onClose();
                }}
                size="sm"
                className="w-full max-w-xs mx-auto"
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
