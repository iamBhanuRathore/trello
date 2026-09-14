import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  LogOut,
  MoreVertical,
  Search,
  Megaphone,
  Loader2,
  ChevronRight,
  ShieldAlert,
  UserMinus,
} from 'lucide-react';
import { toast } from 'sonner';
import { chatService, type ChatChannel, type ChatChannelMember } from '../../lib/chatService';
import { orgService } from '../../lib/orgService';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { PresenceBadge } from './PresenceBadge';

interface ChatDetailsPaneProps {
  channel: ChatChannel;
  onClose: () => void;
}

export const ChatDetailsPane: React.FC<ChatDetailsPaneProps> = ({ channel, onClose }) => {
  const { user } = useAuthStore();
  const { setActiveChannelId, presenceMap } = useChatStore();
  const queryClient = useQueryClient();

  const [memberSearch, setMemberSearch] = useState('');
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState<string | null>(null);
  const [roleToAdd, setRoleToAdd] = useState<'admin' | 'member'>('member');
  const [openMemberMenuId, setOpenMemberMenuId] = useState<string | null>(null);

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
    queryFn: () => (otherUserId ? chatService.getSharedChannels(otherUserId) : { count: 0, channels: [] }),
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

  // Add member mutation
  const addMemberMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'admin' | 'member' }) =>
      chatService.addMember(channel.id, userId, role),
    onSuccess: () => {
      setIsAddMemberOpen(false);
      setSelectedUserToAdd(null);
      queryClient.invalidateQueries({ queryKey: ['chat', 'channel-details', channel.id] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to add member');
    },
  });

  // Update member role mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({ targetUserId, role }: { targetUserId: string; role: 'owner' | 'admin' | 'member' }) =>
      chatService.updateMemberRole(channel.id, targetUserId, role),
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

  // Leave channel
  const handleLeaveChannel = () => {
    if (!user) return;
    if (isOwner && members.length > 1) {
      toast.error('You are the channel owner. Please transfer ownership before leaving.');
      return;
    }
    if (confirm('Are you sure you want to leave this channel?')) {
      removeMemberMutation.mutate(user.id);
    }
  };

  const filteredMembers = useMemo(() => {
    const q = memberSearch.toLowerCase().trim();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

  const otherPresence = otherUserId ? presenceMap[otherUserId] : null;

  return (
    <div className="w-80 md:w-88 border-l border-border bg-card flex flex-col h-full shrink-0 shadow-lg select-none z-20">
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
                    {channel.otherUser.name.charAt(0).toUpperCase()}
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
                      onClick={() => setActiveChannelId(ch.id)}
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
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="absolute -bottom-0.5 -right-0.5">
                            <PresenceBadge status={mPresence?.status || 'offline'} size="sm" />
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {member.name} {isSelf && <span className="text-muted-foreground font-normal">(You)</span>}
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
                              setOpenMemberMenuId(openMemberMenuId === member.userId ? null : member.userId)
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
                                      if (confirm(`Transfer full ownership of "${channel.name}" to ${member.name}?`)) {
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

            {/* Channel Danger Zone / Leave button */}
            <div className="pt-4 border-t border-border">
              <button
                type="button"
                onClick={handleLeaveChannel}
                disabled={removeMemberMutation.isPending}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-destructive hover:bg-destructive/10 border border-destructive/20 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Leave Channel</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Add Member Modal */}
      {isAddMemberOpen &&
        createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-md p-5 space-y-4">
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
              <div>
                <label className="text-xs font-semibold text-foreground">Select Member</label>
                <select
                  value={selectedUserToAdd || ''}
                  onChange={(e) => setSelectedUserToAdd(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="">Choose a workspace member...</option>
                  {eligibleCandidates.map((c: any) => (
                    <option key={c.userId} value={c.userId}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
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
                {addMemberMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Add Member</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
