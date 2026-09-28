import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Users,
  Globe,
  Hash,
  Lock,
  Shield,
  Crown,
  UserPlus,
  MoreVertical,
  Search,
  Megaphone,
  Loader2,
  ChevronRight,
  ShieldAlert,
  UserMinus,
  FolderKanban,
  Link2,
  Unlink,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@boardly/ui/confirm-dialog';
import { chatService, type ChatChannel, type ChatChannelMember } from '../../lib/chatService';
import { orgService } from '../../lib/orgService';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { PresenceBadge } from './PresenceBadge';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { getInitials } from '../../utils/avatar';

interface ChatDetailsPaneProps {
  channel: ChatChannel;
  onClose: () => void;
}

export const ChatDetailsPane: React.FC<ChatDetailsPaneProps> = ({ channel, onClose }) => {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const { activeChannelId, setActiveChannelId, presenceMap } = useChatStore();
  const queryClient = useQueryClient();

  const [memberSearch, setMemberSearch] = useState('');
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState<string | null>(null);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [roleToAdd, setRoleToAdd] = useState<'admin' | 'member'>('member');
  const [openMemberMenuId, setOpenMemberMenuId] = useState<string | null>(null);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');

  useEscapeKey(() => {
    if (isLeaveConfirmOpen) {
      setIsLeaveConfirmOpen(false);
    } else if (isProjectPickerOpen) {
      setIsProjectPickerOpen(false);
    } else if (isAddMemberOpen) {
      setIsAddMemberOpen(false);
    } else if (openMemberMenuId) {
      setOpenMemberMenuId(null);
    } else {
      onClose();
    }
  }, true);

  // Fetch full channel details (including members)
  const { data: channelDetails } = useQuery({
    queryKey: ['chat', 'channel-details', channel.id],
    queryFn: () => chatService.getChannelDetails(channel.id),
  });

  const members: ChatChannelMember[] = useMemo(
    () => channelDetails?.members || [],
    [channelDetails?.members]
  );

  // Determine current user's role in this channel
  const currentMember = useMemo(
    () => members.find((m) => m.userId === user?.id),
    [members, user?.id]
  );
  const currentUserRole = currentMember?.role || channel.role || 'member';
  const isOwner = currentUserRole === 'owner';
  const isAdmin = currentUserRole === 'admin' || isOwner;

  // If DM, fetch shared / mutual channels
  const otherUserId = channel.otherUser?.id;
  const { data: sharedChannelsData, isLoading: isSharedLoading } = useQuery({
    queryKey: ['chat', 'shared-channels', otherUserId],
    queryFn: () =>
      otherUserId ? chatService.getSharedChannels(otherUserId) : { count: 0, channels: [] },
    enabled: channel.type === 'direct' && !!otherUserId,
  });

  // Fetch workspace org members for adding new members
  const { data: orgMembers = [] } = useQuery({
    queryKey: ['org', 'members', user?.organizationId],
    queryFn: () => (user?.organizationId ? orgService.getMembers(user.organizationId) : []),
    enabled: isAddMemberOpen && !!user?.organizationId,
  });

  // Candidates to add (org members not yet in channel)
  const existingUserIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);
  const eligibleCandidates = useMemo(
    () => orgMembers.filter((om: any) => !existingUserIds.has(om.userId) && om.status === 'active'),
    [orgMembers, existingUserIds]
  );
  const filteredCandidates = useMemo(() => {
    const q = candidateSearch.toLowerCase().trim();
    if (!q) return eligibleCandidates;
    return eligibleCandidates.filter(
      (c: any) =>
        c.name?.toLowerCase().includes(q) || (c.email && c.email.toLowerCase().includes(q))
    );
  }, [eligibleCandidates, candidateSearch]);

  // Add member mutation
  const addMemberMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'admin' | 'member' }) =>
      chatService.addMember(channel.id, userId, role),
    onSuccess: () => {
      setIsAddMemberOpen(false);
      setSelectedUserToAdd(null);
      setCandidateSearch('');
      queryClient.invalidateQueries({ queryKey: ['chat', 'channel-details', channel.id] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to add member');
    },
  });

  // Update member role mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({
      targetUserId,
      role,
    }: {
      targetUserId: string;
      role: 'owner' | 'admin' | 'member';
    }) => chatService.updateMemberRole(channel.id, targetUserId, role),
    onSuccess: () => {
      setOpenMemberMenuId(null);
      queryClient.invalidateQueries({ queryKey: ['chat', 'channel-details', channel.id] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to update member role');
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: (targetUserId: string) => chatService.removeMember(channel.id, targetUserId),
    onSuccess: () => {
      setOpenMemberMenuId(null);
      queryClient.invalidateQueries({ queryKey: ['chat', 'channel-details', channel.id] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to remove member');
    },
  });

  // Toggle channel settings mutation (e.g. announcement mode)
  const updateChannelMutation = useMutation({
    mutationFn: (payload: { isAnnouncementOnly?: boolean; allowMemberInvites?: boolean }) =>
      chatService.updateChannel(channel.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'channel-details', channel.id] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to update settings');
    },
  });

  const linkedProject = channelDetails?.project || channel.project || null;

  // Org projects for the link picker (flattened workspaces tree)
  const { data: projectOptions = [] } = useQuery({
    queryKey: ['chat', 'project-options', user?.organizationId],
    queryFn: async () => {
      const res = await api.get('/workspaces/tree');
      const tree = res.data?.workspaces || res.data || [];
      const list: { id: string; name: string; key?: string | null; workspaceName?: string }[] = [];
      for (const ws of tree) {
        for (const p of ws.projects || []) {
          list.push({ id: p.id, name: p.name, key: p.key, workspaceName: ws.name });
        }
      }
      return list;
    },
    enabled: isProjectPickerOpen && !!user?.organizationId,
    staleTime: 60000,
  });

  const filteredProjects = useMemo(() => {
    const q = projectSearch.toLowerCase().trim();
    if (!q) return projectOptions;
    return projectOptions.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.key && p.key.toLowerCase().includes(q)) ||
        (p.workspaceName && p.workspaceName.toLowerCase().includes(q))
    );
  }, [projectOptions, projectSearch]);

  const linkProjectMutation = useMutation({
    mutationFn: (projectId: string) => chatService.linkProject(channel.id, projectId),
    onSuccess: () => {
      setIsProjectPickerOpen(false);
      setProjectSearch('');
      queryClient.invalidateQueries({ queryKey: ['chat', 'channel-details', channel.id] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
      toast.success('Project linked — task activity will appear here');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to link project');
    },
  });

  const unlinkProjectMutation = useMutation({
    mutationFn: () => chatService.unlinkProject(channel.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'channel-details', channel.id] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
      toast.success('Project unlinked');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to unlink project');
    },
  });

  // Leave channel
  const handleLeaveChannel = () => {
    if (!user) return;
    if (isOwner && members.length > 1) {
      toast.error('You are the channel creator. Please transfer ownership before leaving.');
      return;
    }
    setIsLeaveConfirmOpen(true);
  };

  const confirmLeaveChannel = async () => {
    if (!user) return;
    try {
      await removeMemberMutation.mutateAsync(user.id);
      setIsLeaveConfirmOpen(false);
      onClose();
    } catch {
      // handled by mutation
    }
  };

  const filteredMembers = useMemo(() => {
    const q = memberSearch.toLowerCase().trim();
    if (!q) return members;
    return members.filter(
      (m) => m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

  const otherPresence = otherUserId ? presenceMap[otherUserId] : null;

  return (
    <>
      {/* Ambient backdrop on laptop / tablet viewports */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-30 2xl:hidden animate-in fade-in duration-150"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-40 w-80 sm:w-96 2xl:static 2xl:z-20 2xl:w-88 border-l border-border bg-card flex flex-col h-full shrink-0 shadow-2xl 2xl:shadow-none select-none animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0 bg-background/50">
          <h3 className="text-sm font-bold text-foreground">
            {channel.type === 'direct' ? 'Contact Details' : 'Channel Details'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* DIRECT MESSAGE VIEW */}
          {channel.type === 'direct' && channel.otherUser ? (
            <>
              {/* Teammate Profile Header */}
              <div className="flex flex-col items-center text-center space-y-2.5 pb-4 border-b border-border">
                <div className="relative">
                  {channel.otherUser.avatarUrl ? (
                    <img
                      src={channel.otherUser.avatarUrl}
                      alt=""
                      className="w-16 h-16 rounded-full object-cover ring-2 ring-border shadow-sm"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-primary/10 text-primary font-bold text-xl flex items-center justify-center ring-2 ring-border shadow-sm">
                      {getInitials(channel.otherUser.name)}
                    </div>
                  )}
                  <span className="absolute bottom-0 right-0 ring-2 ring-card rounded-full">
                    <PresenceBadge status={otherPresence?.status || 'offline'} size="md" />
                  </span>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-foreground">{channel.otherUser.name}</h4>
                  <p className="text-xs text-muted-foreground">{channel.otherUser.email}</p>
                </div>

                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 text-xs text-foreground font-medium border border-border">
                  <PresenceBadge status={otherPresence?.status || 'offline'} size="sm" />
                  <span className="capitalize">{otherPresence?.status || 'offline'}</span>
                  {otherPresence?.customStatusText && (
                    <span className="text-muted-foreground italic truncate max-w-[140px]">
                      — &ldquo;{otherPresence.customStatusText}&rdquo;
                    </span>
                  )}
                </div>
              </div>

              {/* Timezone & Working Hours Card */}
              <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Globe className="w-3.5 h-3.5 text-blue-500" />
                  <span>Timezone & Schedule</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Local Time</span>
                    <span className="font-mono font-medium text-foreground">
                      {otherPresence?.localTime || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Timezone</span>
                    <span className="font-medium text-foreground truncate max-w-[130px]">
                      {otherPresence?.timezone || channel.otherUser.timezone || 'UTC'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Working Hours</span>
                    <span
                      className={`font-semibold px-2 py-0.5 rounded-md text-[11px] ${
                        otherPresence?.isWithinWorkingHours
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {otherPresence?.isWithinWorkingHours ? 'Active Schedule' : 'Off-Hours'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mutual Shared Groups Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-primary" />
                    <h5 className="text-xs font-bold text-foreground">Mutual Groups</h5>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                    {sharedChannelsData?.count ?? 0}
                  </span>
                </div>

                {isSharedLoading ? (
                  <div className="flex items-center justify-center py-4 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                ) : !sharedChannelsData || sharedChannelsData.channels.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    No other mutual group channels yet.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {sharedChannelsData.channels.map((ch: any) => (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => {
                          if (ch.id === activeChannelId) return;
                          setActiveChannelId(ch.id);
                          navigate(`/chat/${ch.id}`);
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-muted/50 border border-border/50 hover:border-border transition-all text-left cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            {ch.type === 'group_private' ? (
                              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                            ) : (
                              <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                              {ch.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {ch.memberCount} members
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* GROUP CHANNEL VIEW */
            <>
              {/* Channel Info Card */}
              <div className="space-y-3 pb-4 border-b border-border">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {channel.type === 'group_private' ? (
                      <Lock className="w-5 h-5" />
                    ) : (
                      <Hash className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-foreground truncate">{channel.name}</h4>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {channel.topic || 'No topic description provided.'}
                    </p>
                  </div>
                </div>

                {/* Admin Governance Badges & Controls */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-semibold text-muted-foreground capitalize">
                    {channel.type === 'group_private' ? 'Private Group' : 'Public Channel'}
                  </span>
                  {channel.isAnnouncementOnly && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-semibold border border-amber-500/20 flex items-center gap-1">
                      <Megaphone className="w-3 h-3" />
                      Announcement Only
                    </span>
                  )}
                </div>

                {/* Admin settings switches if user is Owner/Admin */}
                {isAdmin && (
                  <div className="pt-2 space-y-2 border-t border-border/60">
                    <label className="flex items-center justify-between text-xs text-foreground cursor-pointer">
                      <span className="flex items-center gap-1.5">
                        <Megaphone className="w-3.5 h-3.5 text-muted-foreground" />
                        Announcement Mode
                      </span>
                      <input
                        type="checkbox"
                        checked={channel.isAnnouncementOnly}
                        onChange={(e) =>
                          updateChannelMutation.mutate({ isAnnouncementOnly: e.target.checked })
                        }
                        className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between text-xs text-foreground cursor-pointer">
                      <span className="flex items-center gap-1.5">
                        <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />
                        Allow Members to Invite
                      </span>
                      <input
                        type="checkbox"
                        checked={channel.allowMemberInvites}
                        onChange={(e) =>
                          updateChannelMutation.mutate({ allowMemberInvites: e.target.checked })
                        }
                        className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Linked Project Section (group channels only) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <FolderKanban className="w-4 h-4 text-primary" />
                    <h5 className="text-xs font-bold text-foreground">Linked Project</h5>
                  </div>
                  {isAdmin &&
                    (linkedProject ? (
                      <button
                        type="button"
                        onClick={() => unlinkProjectMutation.mutate()}
                        disabled={unlinkProjectMutation.isPending}
                        title="Unlink project"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Unlink className="w-3 h-3" />
                        <span>Unlink</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsProjectPickerOpen((v) => !v)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Link</span>
                      </button>
                    ))}
                </div>

                {linkedProject ? (
                  <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-primary/5 border border-primary/20">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold text-xs">
                      {(linkedProject.key || linkedProject.name || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">
                        {linkedProject.key ? `${linkedProject.key} — ` : ''}
                        {linkedProject.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Task activity posts here automatically
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {isAdmin
                      ? 'Link a project to stream task creation, moves, and archives into this channel.'
                      : 'No project linked yet. Channel admins can link one.'}
                  </p>
                )}

                {isProjectPickerOpen && !linkedProject && (
                  <div className="rounded-xl border border-border bg-background shadow-lg overflow-hidden animate-in fade-in-50 duration-150">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        autoFocus
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        placeholder="Search projects..."
                        className="w-full h-9 pl-8 pr-3 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto border-t border-border/60">
                      {filteredProjects.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground text-center py-4">
                          No projects found
                          {projectSearch ? ` matching "${projectSearch}"` : ' in this organization'}
                          .
                        </p>
                      ) : (
                        filteredProjects.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => linkProjectMutation.mutate(p.id)}
                            disabled={linkProjectMutation.isPending}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/60 transition-colors text-left cursor-pointer disabled:opacity-50"
                          >
                            <div className="w-7 h-7 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0 font-bold text-[10px]">
                              {(p.key || p.name || '?').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-foreground truncate">
                                {p.key ? `${p.key} — ` : ''}
                                {p.name}
                              </p>
                              {p.workspaceName && (
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {p.workspaceName}
                                </p>
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Members Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-primary" />
                    <h5 className="text-xs font-bold text-foreground">
                      Members ({members.length})
                    </h5>
                  </div>
                  {(isAdmin || channel.allowMemberInvites) && (
                    <button
                      type="button"
                      onClick={() => setIsAddMemberOpen(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  )}
                </div>

                {/* Search Member input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Filter members..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-muted/40 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Members List */}
                <div className="space-y-1 max-h-72 overflow-y-auto pr-0.5">
                  {filteredMembers.map((member) => {
                    const mPresence = presenceMap[member.userId];
                    const isTargetOwner = member.role === 'owner';
                    const isTargetAdmin = member.role === 'admin';
                    const isSelf = member.userId === user?.id;

                    return (
                      <div
                        key={member.userId}
                        className="relative flex items-center justify-between p-2 rounded-xl hover:bg-muted/40 transition-colors group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0">
                            {member.avatarUrl ? (
                              <img
                                src={member.avatarUrl}
                                alt=""
                                className="w-7 h-7 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                                {getInitials(member.name)}
                              </div>
                            )}
                            <span className="absolute -bottom-0.5 -right-0.5">
                              <PresenceBadge status={mPresence?.status || 'offline'} size="sm" />
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">
                              {member.name}{' '}
                              {isSelf && (
                                <span className="text-muted-foreground font-normal">(You)</span>
                              )}
                            </p>
                            <div className="flex items-center gap-1.5">
                              {isTargetOwner && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                  <Crown className="w-2.5 h-2.5" />
                                  Owner
                                </span>
                              )}
                              {isTargetAdmin && !isTargetOwner && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                                  <Shield className="w-2.5 h-2.5" />
                                  Admin
                                </span>
                              )}
                              {!isTargetAdmin && !isTargetOwner && (
                                <span className="text-[10px] text-muted-foreground">Member</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Member Governance Action Menu */}
                        {isAdmin && !isSelf && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenMemberMenuId(
                                  openMemberMenuId === member.userId ? null : member.userId
                                )
                              }
                              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>

                            {openMemberMenuId === member.userId && (
                              <div className="absolute right-0 top-6 w-44 rounded-xl bg-card border border-border shadow-xl p-1 z-30 space-y-0.5 animate-in fade-in">
                                {/* If Owner: can promote/demote and transfer ownership */}
                                {isOwner && (
                                  <>
                                    {!isTargetAdmin && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateRoleMutation.mutate({
                                            targetUserId: member.userId,
                                            role: 'admin',
                                          })
                                        }
                                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-foreground hover:bg-muted rounded-lg text-left cursor-pointer"
                                      >
                                        <Shield className="w-3.5 h-3.5 text-indigo-500" />
                                        Make Channel Admin
                                      </button>
                                    )}
                                    {isTargetAdmin && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateRoleMutation.mutate({
                                            targetUserId: member.userId,
                                            role: 'member',
                                          })
                                        }
                                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-foreground hover:bg-muted rounded-lg text-left cursor-pointer"
                                      >
                                        <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground" />
                                        Demote to Member
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (
                                          confirm(
                                            `Transfer full ownership of "${channel.name}" to ${member.name}?`
                                          )
                                        ) {
                                          updateRoleMutation.mutate({
                                            targetUserId: member.userId,
                                            role: 'owner',
                                          });
                                        }
                                      }}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 rounded-lg text-left cursor-pointer"
                                    >
                                      <Crown className="w-3.5 h-3.5" />
                                      Transfer Ownership
                                    </button>
                                  </>
                                )}

                                {/* Remove from channel (Owner can remove anyone; Admin can remove regular members) */}
                                {(isOwner || (isAdmin && !isTargetAdmin && !isTargetOwner)) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (confirm(`Remove ${member.name} from this channel?`)) {
                                        removeMemberMutation.mutate(member.userId);
                                      }
                                    }}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg text-left cursor-pointer"
                                  >
                                    <UserMinus className="w-3.5 h-3.5" />
                                    Remove from Channel
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Subtle Channel Membership Footer */}
              {channel.type !== 'direct' && (
                <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span>Membership</span>
                  {isOwner ? (
                    <span className="text-[11px] font-medium text-amber-500 flex items-center gap-1">
                      <Crown className="w-3 h-3" />
                      Channel Creator
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleLeaveChannel}
                      disabled={removeMemberMutation.isPending}
                      className="text-[11px] text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1.5 cursor-pointer py-1 px-2 rounded-lg hover:bg-destructive/10"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                      <span>Leave channel...</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Confirm Leave Channel Modal */}
        <ConfirmDialog
          open={isLeaveConfirmOpen}
          onOpenChange={setIsLeaveConfirmOpen}
          title={`Leave #${channel.name}?`}
          description="You will stop receiving notifications and messages from this channel. To rejoin, an active channel member must invite you back."
          confirmLabel="Leave Channel"
          variant="destructive"
          onConfirm={confirmLeaveChannel}
        />

        {/* Add Member Modal */}
        {isAddMemberOpen &&
          createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
              <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-lg p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-primary" />
                    Add Teammates to Channel
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsAddMemberOpen(false)}
                    className="p-1 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Select Teammate</label>

                    {/* Teammate Search Input */}
                    <div className="relative flex items-center">
                      <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 pointer-events-none" />
                      <input
                        type="text"
                        value={candidateSearch}
                        onChange={(e) => setCandidateSearch(e.target.value)}
                        placeholder="Search teammates by name or email..."
                        className="w-full pl-8 pr-8 py-2 text-xs rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground"
                      />
                      {candidateSearch && (
                        <button
                          type="button"
                          onClick={() => setCandidateSearch('')}
                          className="absolute right-2.5 p-0.5 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Candidates List */}
                    <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border/60 bg-muted/10">
                      {filteredCandidates.length === 0 ? (
                        <div className="p-5 text-center text-xs text-muted-foreground">
                          {candidateSearch
                            ? `No teammates found matching "${candidateSearch}"`
                            : 'All active workspace members are already in this channel'}
                        </div>
                      ) : (
                        filteredCandidates.map((c: any) => {
                          const isSelected = selectedUserToAdd === c.userId;
                          return (
                            <button
                              key={c.userId}
                              type="button"
                              onClick={() => setSelectedUserToAdd(c.userId)}
                              className={`w-full flex items-center justify-between p-2.5 text-xs text-left hover:bg-muted/60 transition-colors cursor-pointer ${
                                isSelected ? 'bg-primary/10' : ''
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {c.avatarUrl ? (
                                  <img
                                    src={c.avatarUrl}
                                    alt=""
                                    className="w-6 h-6 rounded-full object-cover shrink-0"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center shrink-0">
                                    {getInitials(c.name)}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="font-semibold text-foreground truncate">
                                    {c.name}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground truncate">
                                    {c.email}
                                  </div>
                                </div>
                              </div>
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                                  isSelected
                                    ? 'bg-primary border-primary text-primary-foreground'
                                    : 'border-border'
                                }`}
                              >
                                {isSelected && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                )}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {isOwner && (
                    <div>
                      <label className="text-xs font-semibold text-foreground">Channel Role</label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setRoleToAdd('member')}
                          className={`p-2 rounded-xl text-xs font-medium border text-center transition-colors cursor-pointer ${
                            roleToAdd === 'member'
                              ? 'bg-primary/10 border-primary text-primary font-bold'
                              : 'bg-background border-border text-muted-foreground'
                          }`}
                        >
                          Member
                        </button>
                        <button
                          type="button"
                          onClick={() => setRoleToAdd('admin')}
                          className={`p-2 rounded-xl text-xs font-medium border text-center transition-colors cursor-pointer ${
                            roleToAdd === 'admin'
                              ? 'bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold'
                              : 'bg-background border-border text-muted-foreground'
                          }`}
                        >
                          Admin
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsAddMemberOpen(false)}
                    className="px-3 py-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedUserToAdd) {
                        addMemberMutation.mutate({
                          userId: selectedUserToAdd,
                          role: roleToAdd,
                        });
                      }
                    }}
                    disabled={!selectedUserToAdd || addMemberMutation.isPending}
                    className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    {addMemberMutation.isPending && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    <span>Add Member</span>
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>
    </>
  );
};
