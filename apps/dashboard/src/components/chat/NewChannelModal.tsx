import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Hash, Lock, Users, X, Loader2, Megaphone, UserPlus, Check } from 'lucide-react';
import { toast } from 'sonner';
import { orgService } from '../../lib/orgService';
import { chatService } from '../../lib/chatService';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';

interface NewChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewChannelModal: React.FC<NewChannelModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const { setActiveChannelId } = useChatStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isAnnouncementOnly, setIsAnnouncementOnly] = useState(false);
  const [allowMemberInvites, setAllowMemberInvites] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Fetch org members for selection
  const { data: members = [] } = useQuery({
    queryKey: ['org', 'members', user?.organizationId],
    queryFn: () => (user?.organizationId ? orgService.getMembers(user.organizationId) : []),
    enabled: isOpen && !!user?.organizationId,
  });

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
      setActiveChannelId(channel.id);
      onClose();
      // Reset form
      setName('');
      setTopic('');
      setSelectedUserIds([]);
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 pb-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground">Create a Channel</h3>
              <p className="text-xs text-muted-foreground">
                Channels are where your team collaborates on topics and projects
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Channel Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>Channel Name</span>
              <span className="text-rose-500">*</span>
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-muted-foreground font-semibold">#</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. design-critique, general, announcement"
                autoFocus
                className="w-full pl-7 pr-3 py-2 text-xs rounded-xl bg-muted/40 border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              />
            </div>
          </div>

          {/* Channel Topic */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Topic or Description</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What is this channel about?"
              className="w-full px-3 py-2 text-xs rounded-xl bg-muted/40 border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>

          {/* Visibility Toggle */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">Privacy</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsPrivate(false)}
                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-colors cursor-pointer ${
                  !isPrivate
                    ? 'border-primary/50 bg-primary/5 text-foreground'
                    : 'border-border hover:bg-muted/40 text-muted-foreground'
                }`}
              >
                <Hash className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-xs text-foreground">Public</div>
                  <div className="text-[11px] text-muted-foreground">Anyone in company can join</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setIsPrivate(true)}
                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-colors cursor-pointer ${
                  isPrivate
                    ? 'border-primary/50 bg-primary/5 text-foreground'
                    : 'border-border hover:bg-muted/40 text-muted-foreground'
                }`}
              >
                <Lock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-xs text-foreground">Private</div>
                  <div className="text-[11px] text-muted-foreground">Only invited members can view</div>
                </div>
              </button>
            </div>
          </div>

          {/* Advanced Governance Toggles */}
          <div className="space-y-2.5 p-3 rounded-xl bg-muted/30 border border-border/80">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <Megaphone className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-foreground">Announcement Channel</div>
                  <div className="text-[11px] text-muted-foreground">
                    Only channel admins can post; members can react and reply in threads
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isAnnouncementOnly}
                onChange={(e) => setIsAnnouncementOnly(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40">
              <div className="flex items-start gap-2 min-w-0">
                <UserPlus className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-foreground">Allow Member Invites</div>
                  <div className="text-[11px] text-muted-foreground">
                    Allow regular members to invite other colleagues into this channel
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={allowMemberInvites}
                onChange={(e) => setAllowMemberInvites(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary cursor-pointer"
              />
            </div>
          </div>

          {/* Member Picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Add Members ({selectedUserIds.length} selected)
            </label>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-border divide-y divide-border/60">
              {members
                .filter((m: any) => m.userId !== user?.id)
                .map((m: any) => {
                  const isSelected = selectedUserIds.includes(m.userId);
                  return (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => toggleUserSelection(m.userId)}
                      className={`w-full flex items-center justify-between p-2.5 text-xs text-left hover:bg-muted/60 transition-colors cursor-pointer ${
                        isSelected ? 'bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {m.avatarUrl ? (
                          <img
                            src={m.avatarUrl}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center shrink-0">
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground truncate">{m.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{m.email}</div>
                        </div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-border'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-muted/20 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || createChannelMutation.isPending}
            onClick={() => createChannelMutation.mutate()}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
          >
            {createChannelMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Create Channel</span>
          </button>
        </div>
      </div>
    </div>
  );
};
