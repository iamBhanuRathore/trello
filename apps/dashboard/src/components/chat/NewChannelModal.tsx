import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Hash, Lock, Users, X, Loader2, Megaphone, UserPlus, Check, Search } from 'lucide-react';
import { toast } from 'sonner';
import { orgService } from '../../lib/orgService';
import { chatService } from '../../lib/chatService';
import { presenceService } from '../../lib/presenceService';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { PresenceBadge } from './PresenceBadge';
import { useDialogClose } from '../../hooks/useDialogClose';
import { getInitials } from '../../utils/avatar';

interface NewChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewChannelModal: React.FC<NewChannelModalProps> = ({ isOpen, onClose }) => {
  // One sanctioned close path (X / backdrop / Esc, idempotent).
  const { requestClose, handleOverlayClick } = useDialogClose({ isOpen, onClose });

  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { setActiveChannelId, openGlobalDock } = useChatStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isAnnouncementOnly, setIsAnnouncementOnly] = useState(false);
  const [allowMemberInvites, setAllowMemberInvites] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');

  // Fetch org members for selection
  const { data: members = [] } = useQuery({
    queryKey: ['org', 'members', user?.organizationId],
    queryFn: () => (user?.organizationId ? orgService.getMembers(user.organizationId) : []),
    enabled: isOpen && !!user?.organizationId,
  });

  // Batch query presence for members
  const memberUserIds = useMemo(() => members.map((m: any) => m.userId), [members]);
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

  const selectedMembers = useMemo(
    () => members.filter((m: any) => selectedUserIds.includes(m.userId)),
    [members, selectedUserIds]
  );

  const filteredMembers = useMemo(() => {
    const q = memberSearch.toLowerCase().trim();
    const otherMembers = members.filter((m: any) => m.userId !== user?.id && m.status === 'active');
    if (!q) return otherMembers;
    return otherMembers.filter(
      (m: any) =>
        m.name?.toLowerCase().includes(q) || (m.email && m.email.toLowerCase().includes(q))
    );
  }, [members, user?.id, memberSearch]);

  const createChannelMutation = useMutation({
    mutationFn: () =>
      chatService.createGroupChannel({
        name: name.trim(),
        topic: topic.trim() || undefined,
        isPrivate,
        isAnnouncementOnly,
        allowMemberInvites,
        memberUserIds: selectedUserIds,
      }),
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
      if (location.pathname.startsWith('/chat')) {
        setActiveChannelId(channel.id);
        navigate(`/chat/${channel.id}`);
      } else {
        openGlobalDock(channel.id);
      }
      requestClose();
      // Reset form
      setName('');
      setTopic('');
      setSelectedUserIds([]);
      setMemberSearch('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to create channel');
    },
  });

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-card w-full max-w-4xl max-h-[90vh] rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0 bg-muted/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-foreground">Create a Channel</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {isPrivate ? 'Private' : 'Public'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Channels are where your team collaborates, shares updates, and makes decisions
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2-Column Responsive Body */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 overflow-y-auto flex-1">
          {/* Left Column: Channel Details & Settings (5 cols) */}
          <div className="md:col-span-5 space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Channel Information
              </h4>

              {/* Channel Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    Channel Name <span className="text-rose-500">*</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    {name.length}/40
                  </span>
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-muted-foreground font-semibold text-sm">
                    #
                  </span>
                  <input
                    type="text"
                    value={name}
                    maxLength={40}
                    onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                    placeholder="e.g. general, announcements, design-crit"
                    autoFocus
                    className="w-full pl-8 pr-3 py-2.5 text-xs rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors font-medium text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Names must be lowercase and without spaces
                </p>
              </div>

              {/* Channel Topic / Description */}
              <div className="space-y-1.5 mt-3">
                <label className="text-xs font-semibold text-foreground">
                  Topic or Purpose{' '}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="What is this channel about? Set topic or team guidelines..."
                  rows={3}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors resize-none placeholder:text-muted-foreground text-foreground"
                />
              </div>
            </div>

            {/* Privacy Selection */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Privacy
              </h4>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsPrivate(false)}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                    !isPrivate
                      ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary/40 shadow-xs'
                      : 'border-border hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <Hash className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-bold text-xs text-foreground">Public</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Anyone in the company can join and view history
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPrivate(true)}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                    isPrivate
                      ? 'border-amber-500 bg-amber-500/5 text-foreground ring-1 ring-amber-500/40 shadow-xs'
                      : 'border-border hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-bold text-xs text-foreground">Private</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Only invited teammates can view and join
                  </p>
                </button>
              </div>
            </div>

            {/* Channel Governance Options */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Permissions & Governance
              </h4>
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-3">
                <label className="flex items-start justify-between gap-3 cursor-pointer select-none">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0 mt-0.5">
                      <Megaphone className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground">
                        Announcement Channel
                      </div>
                      <div className="text-[11px] text-muted-foreground leading-tight">
                        Only channel admins post; members react & reply in threads
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isAnnouncementOnly}
                    onChange={(e) => setIsAnnouncementOnly(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary cursor-pointer mt-1"
                  />
                </label>

                <div className="border-t border-border/50" />

                <label className="flex items-start justify-between gap-3 cursor-pointer select-none">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                      <UserPlus className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground">
                        Allow Member Invites
                      </div>
                      <div className="text-[11px] text-muted-foreground leading-tight">
                        Allow regular members to invite other colleagues
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowMemberInvites}
                    onChange={(e) => setAllowMemberInvites(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary cursor-pointer mt-1"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Right Column: Member Picker (7 cols) */}
          <div className="md:col-span-7 flex flex-col space-y-3 border-t md:border-t-0 md:border-l border-border md:pl-6 pt-4 md:pt-0">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Add Members
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold text-[11px]">
                  {selectedUserIds.length} selected
                </span>
              </div>
              {filteredMembers.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const allFilteredSelected = filteredMembers.every((m: any) =>
                      selectedUserIds.includes(m.userId)
                    );
                    if (allFilteredSelected) {
                      const filteredIds = new Set(filteredMembers.map((m: any) => m.userId));
                      setSelectedUserIds((prev) => prev.filter((id) => !filteredIds.has(id)));
                    } else {
                      const newIds = new Set([
                        ...selectedUserIds,
                        ...filteredMembers.map((m: any) => m.userId),
                      ]);
                      setSelectedUserIds(Array.from(newIds));
                    }
                  }}
                  className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  {filteredMembers.every((m: any) => selectedUserIds.includes(m.userId))
                    ? 'Deselect all filtered'
                    : 'Select all filtered'}
                </button>
              )}
            </div>

            {/* Teammate Search Bar */}
            <div className="relative flex items-center shrink-0">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search teammates by name or email..."
                className="w-full pl-9 pr-8 py-2.5 text-xs rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground"
              />
              {memberSearch && (
                <button
                  type="button"
                  onClick={() => setMemberSearch('')}
                  className="absolute right-2.5 p-1 rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Selected Chips Tray */}
            {selectedMembers.length > 0 && (
              <div className="shrink-0 flex flex-wrap gap-1.5 p-2 rounded-xl bg-muted/20 border border-border/60 max-h-20 overflow-y-auto">
                {selectedMembers.map((m: any) => (
                  <span
                    key={m.userId}
                    className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-lg bg-card border border-border text-[11px] font-medium text-foreground shadow-xs animate-in zoom-in-95 duration-100"
                  >
                    {m.avatarUrl ? (
                      <img
                        src={m.avatarUrl}
                        alt=""
                        className="w-4 h-4 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-primary/20 text-primary font-bold text-[9px] flex items-center justify-center shrink-0">
                        {getInitials(m.name)}
                      </div>
                    )}
                    <span className="truncate max-w-[110px]">{m.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleUserSelection(m.userId)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Teammates List */}
            <div className="flex-1 min-h-[300px] max-h-[380px] overflow-y-auto rounded-xl border border-border divide-y divide-border/60 bg-muted/10">
              {filteredMembers.length === 0 ? (
                <div className="h-full min-h-[200px] flex flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground">
                  <Users className="w-8 h-8 text-muted-foreground/40 mb-2" />
                  {memberSearch ? (
                    <>
                      No teammates found matching{' '}
                      <span className="font-semibold text-foreground">"{memberSearch}"</span>
                    </>
                  ) : (
                    'No active workspace teammates found'
                  )}
                </div>
              ) : (
                filteredMembers.map((m: any) => {
                  const isSelected = selectedUserIds.includes(m.userId);
                  const p = presenceMap[m.userId];
                  return (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => toggleUserSelection(m.userId)}
                      className={`w-full flex items-center justify-between p-3 text-xs text-left hover:bg-muted/60 transition-colors cursor-pointer ${
                        isSelected ? 'bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          {m.avatarUrl ? (
                            <img
                              src={m.avatarUrl}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                              {getInitials(m.name)}
                            </div>
                          )}
                          <span className="absolute bottom-0 right-0 translate-x-0.5 translate-y-0.5">
                            <PresenceBadge status={p?.status || 'offline'} size="sm" />
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground truncate">{m.name}</span>
                            {p?.localTime && (
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                                {p.localTime}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {m.email}
                          </div>
                        </div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-primary border-primary text-primary-foreground shadow-xs'
                            : 'border-border hover:border-muted-foreground/60'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-muted/20 border-t border-border flex items-center justify-between shrink-0">
          <div className="text-xs text-muted-foreground hidden sm:block">
            {isPrivate ? 'Private channel' : 'Public channel'} • {selectedUserIds.length} members
            will be added
          </div>
          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={requestClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!name.trim() || createChannelMutation.isPending}
              onClick={() => createChannelMutation.mutate()}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2 shadow-sm"
            >
              {createChannelMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Create Channel</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
