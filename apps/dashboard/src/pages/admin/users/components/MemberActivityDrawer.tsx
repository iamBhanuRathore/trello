import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { orgService, type OrgMember } from '../../../../lib/orgService';
import { useDialogClose } from '../../../../hooks/useDialogClose';
import { QueryError } from '../../../../components/common/QueryError';
import { Avatar, AvatarFallback, AvatarImage } from '@boardly/ui/avatar';
import { Button } from '@boardly/ui/button';
import {
  Activity,
  X,
  RefreshCw,
  Lock,
  AlertTriangle,
  CheckSquare,
  Timer,
  Briefcase,
  Shield,
  LogOut,
  Unlock,
  UserX,
} from 'lucide-react';
import { formatRelativeTime } from '../types';

interface MemberActivityDrawerProps {
  memberId: string | null;
  onClose: () => void;
  orgId: string;
  onOpenChangeRole: (member: OrgMember) => void;
  onOpenDeactivate: (member: OrgMember) => void;
  onReactivate: (memberId: string) => void;
  onForceLogout: (memberId: string) => void;
}

export const MemberActivityDrawer: React.FC<MemberActivityDrawerProps> = ({
  memberId,
  onClose,
  orgId,
  onOpenChangeRole,
  onOpenDeactivate,
  onReactivate,
  onForceLogout,
}) => {
  const isOpen = !!memberId;

  const { requestClose, handleOverlayClick } = useDialogClose({
    isOpen,
    onClose,
  });

  const {
    data: activitySummary,
    isLoading: isLoadingSummary,
    isError: isSummaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['memberActivity', orgId, memberId],
    queryFn: () => orgService.getMemberActivitySummary(orgId, memberId!),
    enabled: !!orgId && !!memberId,
  });

  if (!isOpen) return null;

  return (
    <div
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 bg-background/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card border-l border-border h-full shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200"
      >
        <div>
          {/* Drawer Header */}
          <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="font-bold text-sm text-foreground">
                Member Intelligence & Governance
              </span>
            </div>
            <button
              onClick={requestClose}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isLoadingSummary ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs">Loading member summary...</span>
            </div>
          ) : isSummaryError && !activitySummary ? (
            <div className="p-5">
              <QueryError
                message="Couldn't load this member's summary."
                onRetry={() => refetchSummary()}
              />
            </div>
          ) : activitySummary ? (
            <div className="p-5 space-y-6">
              {/* Profile Header */}
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 ring-2 ring-primary/20">
                  <AvatarImage src={activitySummary.member.avatarUrl || ''} />
                  <AvatarFallback className="text-base font-bold bg-primary/10 text-primary">
                    {activitySummary.member.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-bold text-base text-foreground">
                    {activitySummary.member.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">{activitySummary.member.email}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 capitalize">
                      {activitySummary.member.role.replace('_', ' ')}
                    </span>
                    {activitySummary.member.status === 'deactivated' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Deactivated
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        Active
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Deactivation Reason if present */}
              {activitySummary.member.status === 'deactivated' &&
                activitySummary.member.deactivationReason && (
                  <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/5 text-xs text-destructive flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Deactivation Note:</span>{' '}
                      <span>{activitySummary.member.deactivationReason}</span>
                    </div>
                  </div>
                )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border bg-muted/20">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckSquare className="w-3.5 h-3.5 text-primary" />
                    <span>Active Tasks</span>
                  </div>
                  <div className="text-xl font-bold text-foreground mt-1">
                    {activitySummary.stats.activeCardsCount}
                  </div>
                </div>

                <div className="p-3 rounded-xl border bg-muted/20">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Timer className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Logged Time (30d)</span>
                  </div>
                  <div className="text-xl font-bold text-foreground mt-1">
                    {activitySummary.stats.timeLogged30dHours} hrs
                  </div>
                </div>
              </div>

              {/* Workspace Memberships */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Workspace Assignments ({activitySummary.workspaces.length})</span>
                </h4>
                {activitySummary.workspaces.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No workspace memberships found.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {activitySummary.workspaces.map((ws) => (
                      <div
                        key={ws.workspaceId}
                        className="flex items-center justify-between p-2 rounded-lg border bg-background text-xs"
                      >
                        <span className="font-medium text-foreground">{ws.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground capitalize font-semibold">
                          {ws.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity Timestamps */}
              <div className="p-3.5 rounded-xl border bg-muted/20 space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Joined Organization:</span>
                  <span className="font-medium text-foreground">
                    {formatRelativeTime(activitySummary.member.joinedAt)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Last Platform Login:</span>
                  <span className="font-medium text-foreground">
                    {formatRelativeTime(activitySummary.member.lastLoginAt)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Last Organization Activity:</span>
                  <span className="font-medium text-foreground">
                    {formatRelativeTime(activitySummary.member.lastActiveAt)}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Drawer Footer Actions */}
        {activitySummary && (
          <div className="p-4 border-t border-border bg-muted/20 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => onOpenChangeRole(activitySummary.member)}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Change Role</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => onForceLogout(activitySummary.member.id)}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Force Logout</span>
              </Button>
            </div>

            {activitySummary.member.status === 'deactivated' ? (
              <Button
                size="sm"
                className="w-full text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => onReactivate(activitySummary.member.id)}
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Reactivate Account</span>
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                className="w-full text-xs gap-1.5"
                onClick={() => onOpenDeactivate(activitySummary.member)}
              >
                <UserX className="w-3.5 h-3.5" />
                <span>Deactivate Member (Soft Delete)</span>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
