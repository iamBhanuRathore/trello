import type { ColumnDef } from '@boardly/ui/enterprise-data-grid';
import type { OrgMember } from '../../../../lib/orgService';
import { Avatar, AvatarFallback, AvatarImage } from '@boardly/ui/avatar';
import { Button } from '@boardly/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@boardly/ui/dropdown-menu';
import {
  Activity,
  MoreHorizontal,
  Shield,
  Unlock,
  UserX,
  LogOut,
  Trash2,
  Lock,
  Mail,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { ROLE_DESCRIPTIONS, formatRelativeTime } from '../types';

interface MemberColumnsOptions {
  currentUserId?: string;
  onSelectMember: (memberId: string) => void;
  onOpenChangeRole: (member: OrgMember) => void;
  onOpenDeactivate: (member: OrgMember) => void;
  onReactivate: (memberId: string) => void;
  onForceLogout: (memberId: string) => void;
  onRemoveMember: (member: OrgMember) => void;
}

export function getMemberColumns({
  currentUserId,
  onSelectMember,
  onOpenChangeRole,
  onOpenDeactivate,
  onReactivate,
  onForceLogout,
  onRemoveMember,
}: MemberColumnsOptions): ColumnDef<OrgMember>[] {
  return [
    {
      id: 'user',
      header: 'User & Profile',
      sortable: true,
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => onSelectMember(row.id)}
        >
          <Avatar className="h-9 w-9 ring-1 ring-border group-hover:ring-primary transition-all">
            <AvatarImage src={row.avatarUrl || ''} />
            <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
              {row.name ? row.name.substring(0, 2).toUpperCase() : 'U'}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-semibold text-xs text-foreground flex items-center gap-2 group-hover:text-primary transition-colors">
              <span>{row.name}</span>
              {row.userId === currentUserId && (
                <span className="text-[10px] font-bold text-primary px-1.5 py-0.2 rounded-full bg-primary/10 border border-primary/20">
                  You
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">{row.email}</div>
          </div>
        </div>
      ),
      exportValue: (row) => `${row.name} (${row.email})`,
    },
    {
      id: 'role',
      header: 'Organization Role',
      sortable: true,
      filterable: true,
      accessorFn: (row) => row.role,
      cell: ({ row }) => {
        const roleConfig = ROLE_DESCRIPTIONS[row.role] || {
          title: row.role ? row.role.replace('_', ' ') : 'Member',
          icon: Shield,
        };
        const RoleIcon = roleConfig.icon;
        return (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              row.role === 'org_owner'
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                : row.role === 'org_admin'
                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25'
                  : row.role === 'viewer'
                    ? 'bg-muted text-muted-foreground border-border'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
            }`}
          >
            <RoleIcon className="w-3 h-3" />
            <span>{roleConfig.title}</span>
          </span>
        );
      },
      exportValue: (row) => row.role,
    },
    {
      id: 'status',
      header: 'Account Status',
      sortable: true,
      filterable: true,
      accessorFn: (row) => row.status,
      cell: ({ row }) => {
        if (row.status === 'deactivated') {
          return (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-destructive/10 text-destructive border border-destructive/20">
              <Lock className="w-3 h-3" />
              <span>Deactivated</span>
            </span>
          );
        }
        if (row.status === 'invited') {
          return (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Mail className="w-3 h-3" />
              <span>Invited</span>
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            <span>Active</span>
          </span>
        );
      },
      exportValue: (row) => row.status,
    },
    {
      id: 'lastSeen',
      header: 'Last Active',
      sortable: true,
      accessorFn: (row) => row.lastActiveAt || row.lastLoginAt,
      cell: ({ row }) => (
        <div className="flex flex-col text-xs">
          <span className="text-foreground font-medium flex items-center gap-1">
            <Clock className="w-3 h-3 text-muted-foreground" />
            {formatRelativeTime(row.lastActiveAt || row.lastLoginAt)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            Joined {formatRelativeTime(row.joinedAt)}
          </span>
        </div>
      ),
      exportValue: (row) => formatRelativeTime(row.lastActiveAt || row.lastLoginAt),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-primary gap-1 cursor-pointer hidden sm:flex"
            onClick={() => onSelectMember(row.id)}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Activity</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                className="cursor-pointer text-xs gap-2"
                onClick={() => onSelectMember(row.id)}
              >
                <Activity className="w-3.5 h-3.5 text-muted-foreground" /> View Member Details
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-xs gap-2"
                onClick={() => onOpenChangeRole(row)}
              >
                <Shield className="w-3.5 h-3.5 text-muted-foreground" /> Change Role
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {row.status === 'deactivated' ? (
                <DropdownMenuItem
                  className="cursor-pointer text-xs gap-2 text-emerald-600 dark:text-emerald-400 focus:bg-emerald-500/10"
                  onClick={() => onReactivate(row.id)}
                >
                  <Unlock className="w-3.5 h-3.5" /> Reactivate Account
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="cursor-pointer text-xs gap-2 text-amber-600 dark:text-amber-400 focus:bg-amber-500/10"
                  onClick={() => onOpenDeactivate(row)}
                >
                  <UserX className="w-3.5 h-3.5" /> Deactivate Account (Soft)
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                className="cursor-pointer text-xs gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => onForceLogout(row.id)}
              >
                <LogOut className="w-3.5 h-3.5" /> Terminate Sessions
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className="cursor-pointer text-xs gap-2"
                onClick={() => onRemoveMember(row)}
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove User
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];
}
