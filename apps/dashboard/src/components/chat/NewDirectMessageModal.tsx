import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, X, MessageSquare, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { orgService } from '../../lib/orgService';
import { chatService } from '../../lib/chatService';
import { presenceService } from '../../lib/presenceService';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { PresenceBadge } from './PresenceBadge';

interface NewDirectMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewDirectMessageModal: React.FC<NewDirectMessageModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user } = useAuthStore();
  const { setActiveChannelId } = useChatStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  // Fetch org members
  const { data: members = [], isLoading: isMembersLoading } = useQuery({
    queryKey: ['org', 'members', user?.organizationId],
    queryFn: () => (user?.organizationId ? orgService.getMembers(user.organizationId) : []),
    enabled: isOpen && !!user?.organizationId,
  });

  // Filter out self
  const otherMembers = useMemo(
    () => members.filter((m: any) => m.userId !== user?.id && m.status === 'active'),
    [members, user?.id]
  );

  // Batch query presence for other members
  const memberUserIds = useMemo(() => otherMembers.map((m: any) => m.userId), [otherMembers]);

  const { data: presences = [] } = useQuery({
    queryKey: ['presence', 'batch', memberUserIds.join(',')],
    queryFn: () => presenceService.getUsersPresence(memberUserIds),
    enabled: isOpen && memberUserIds.length > 0,
    staleTime: 30000,
  });

  const presenceMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const p of presences) {
      map[p.userId] = p;
    }
    return map;
  }, [presences]);

  const filteredMembers = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return otherMembers;
    return otherMembers.filter(
      (m: any) =>
        m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }, [otherMembers, search]);

  const createDmMutation = useMutation({
    mutationFn: (targetUserId: string) => chatService.createDirectMessage(targetUserId),
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
      setActiveChannelId(channel.id);
      onClose();
      setSearch('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to start direct message');
    },
  });

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm text-foreground">New Direct Message</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border/70 flex items-center gap-2.5 bg-muted/20">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type teammate name or email..."
            autoFocus
            className="w-full text-xs bg-transparent border-0 outline-none placeholder:text-muted-foreground focus:ring-0 px-0"
          />
        </div>

        {/* Colleagues list */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1 divide-y divide-border/40">
          {isMembersLoading && (
            <div className="p-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {!isMembersLoading && filteredMembers.length === 0 && (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No teammates found matching "{search}"
            </div>
          )}

          {filteredMembers.map((m: any) => {
            const p = presenceMap[m.userId];
            return (
              <button
                key={m.userId}
                type="button"
                disabled={createDmMutation.isPending}
                onClick={() => createDmMutation.mutate(m.userId)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-muted/70 transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    {m.avatarUrl ? (
                      <img
                        src={m.avatarUrl}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="absolute bottom-0 right-0 translate-x-0.5 translate-y-0.5">
                      <PresenceBadge status={p?.status || 'offline'} size="sm" />
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {m.name}
                      </span>
                      {p?.localTime && (
                        <span className="text-[10px] text-muted-foreground/80 bg-muted px-1.5 py-0.5 rounded font-mono">
                          {p.localTime}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{m.email}</div>
                  </div>
                </div>

                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
};
