import type { ColumnDef } from '@boardly/ui/enterprise-data-grid';
import type { PendingInvitation } from '../../../../lib/orgService';
import { Button } from '@boardly/ui/button';
import { Mail, Shield, Clock, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '../types';

interface InvitationColumnsOptions {
  onResend: (invitationId: string) => void;
  onRevoke: (invitationId: string) => void;
}

export function getInvitationColumns({
  onResend,
  onRevoke,
}: InvitationColumnsOptions): ColumnDef<PendingInvitation>[] {
  return [
    {
      id: 'email',
      header: 'Invited Email',
      sortable: true,
      accessorFn: (row) => row.email,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
            <Mail className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-xs text-foreground">{row.email}</div>
            <div className="text-[10px] text-muted-foreground">
              Sent {formatRelativeTime(row.createdAt)}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'role',
      header: 'Target Role',
      sortable: true,
      accessorFn: (row) => row.role,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
          <Shield className="w-3 h-3" />
          <span>{row.role ? row.role.replace('_', ' ') : 'Member'}</span>
        </span>
      ),
    },
    {
      id: 'expires',
      header: 'Expires In',
      sortable: true,
      accessorFn: (row) => row.expiresAt,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
          <Clock className="w-3.5 h-3.5 text-amber-500" />
          {formatRelativeTime(row.expiresAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 cursor-pointer hover:border-primary"
            onClick={() => {
              if (!row.token) {
                onResend(row.id);
                return;
              }
              const link = `${window.location.origin}/invite?token=${row.token}`;
              navigator.clipboard.writeText(link);
              toast.success('Invite link copied to clipboard!');
            }}
          >
            <Copy className="w-3 h-3" />
            <span>Copy Link</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5 cursor-pointer hover:text-primary"
            onClick={() => onResend(row.id)}
          >
            <RefreshCw className="w-3 h-3" />
            <span>Refresh</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:bg-destructive/10 cursor-pointer"
            onClick={() => onRevoke(row.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];
}
