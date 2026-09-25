import {
  useState,
  useRef,
  useEffect,
  useMemo,
  type KeyboardEvent,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MessageSquare,
  Video,
  UserPlus,
  Search,
  CheckCheck,
  Paperclip,
  Smile,
  Send,
  Loader2,
  AtSign,
  X,
  FileImage,
  CornerUpLeft,
  Copy,
  Pencil,
  Trash2,
  MoreHorizontal,
  CheckSquare,
  Flag,
  Share2,
  FileText,
  UploadCloud,
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { toast } from 'sonner';
import { orgService } from '../../lib/orgService';
import { useAuthStore } from '../../store/authStore';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { CreateTaskFromMessageModal } from './CreateTaskFromMessageModal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { MemberPicker } from './MemberPicker';
import { useChatStore } from '../../store/chatStore';

export interface ChatMessage {
  id: string;
  type?: 'message' | 'system';
  userId?: string;
  authorName?: string;
  authorEmail?: string;
  authorAvatarUrl?: string;
  body: string;
  createdAt: string;
  isEdited?: boolean;
  attachments?: Array<{
    id: string;
    fileName: string;
    url: string;
    fileType?: string;
  }>;
}

export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl?: string;
  name: string;
  size: number;
  type: string;
}

interface TaskChatPaneProps {
  cardId: string;
  cardTitle: string;
  boardId?: string;
  defaultListId?: string;
  membersCount?: number;
  comments: ChatMessage[];
  systemActivities?: Array<{
    id: string;
    text: string;
    createdAt: string;
  }>;
  participantUserIds?: Set<string>;
  onAddParticipant?: (userId: string) => void;
  onRemoveParticipant?: (userId: string) => void;
  onSendMessage: (body: string, mentionedUserIds: string[]) => Promise<void> | void;
  onEditMessage?: (commentId: string, newBody: string) => Promise<void> | void;
  onDeleteMessage?: (commentId: string) => Promise<void> | void;
  onUploadAttachment?: (file: File) => Promise<any> | any;
  onAddMemberClick?: () => void;
  isSending?: boolean;
}

/**
 * Parses markdown quote prefix if present.
 * Format 1: > **Author** [ref:UUID]: Snippet\n\nActual body
 * Format 2: > Snippet\n\nActual body
 */
function parseQuotedMessage(body: string) {
  const fullMatch = body.match(/^>\s*\*\*([^*]+)\*\*(?:\s*\[ref:([^\]]+)\])?:\s*(.*?)\n\n(.*)$/s);
  if (fullMatch) {
    return {
      hasQuote: true,
      author: fullMatch[1],
      refId: fullMatch[2] || null,
      snippet: fullMatch[3],
      content: fullMatch[4],
    };
  }

  const simpleMatch = body.match(/^>\s*(.*?)\n\n(.*)$/s);
  if (simpleMatch) {
    return {
      hasQuote: true,
      author: 'Quoted message',
      refId: null,
      snippet: simpleMatch[1],
      content: simpleMatch[2],
    };
  }

  return {
    hasQuote: false,
    author: null,
    refId: null,
    snippet: null,
    content: body || '',
  };
}

/**
 * Detects if a comment is an automated system/activity log (e.g. checklist, watcher, status changes)
 */
function isActivityComment(body: string): boolean {
  if (!body) return false;
  const trimmed = body.trim();
  return (
    trimmed.startsWith('📋 Added checklist') ||
    trimmed.startsWith('➕ Added checklist') ||
    trimmed.startsWith('☑️ Completed checklist') ||
    trimmed.startsWith('⬜ Marked checklist') ||
    trimmed.startsWith('🗑️ Removed checklist') ||
    trimmed.startsWith('⚡') ||
    trimmed.startsWith('📌') ||
    trimmed.startsWith('🏷️') ||
    trimmed.startsWith('👀') ||
    trimmed.startsWith('👤') ||
    trimmed.startsWith('🤝')
  );
}

/**
 * Formats activity text for rendering in centered system activity pills
 */
function formatActivityText(c: ChatMessage): string {
  const author = c.authorName || c.authorEmail?.split('@')[0] || 'Teammate';
  const body = c.body.trim();

  // Strip markdown bold asterisks **text** -> text
  const cleanBody = body.replace(/\*\*(.*?)\*\*/g, '$1');

  // First line in case of multiline lists
  const firstLine = cleanBody.split('\n')[0].trim();

  // Remove leading emojis like 📋, ➕, ☑️, ⬜, 🗑️, etc. and trim
  const textWithoutEmoji = firstLine
    .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\s]+/u, '')
    .trim();

  // Lowercase initial verb: "Added checklist..." -> "added checklist..."
  const verbLower = textWithoutEmoji.charAt(0).toLowerCase() + textWithoutEmoji.slice(1);

  // Clean trailing colon if it was followed by a list
  const cleanVerb = verbLower.replace(/:$/, '');

  return `${author} ${cleanVerb}`;
}

export function TaskChatPane({
  cardTitle,
  boardId,
  defaultListId,
  membersCount = 1,
  comments = [],
  systemActivities = [],
  participantUserIds,
  onAddParticipant,
  onRemoveParticipant,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onUploadAttachment,
  onAddMemberClick,
  isSending = false,
}: TaskChatPaneProps) {
  const { user } = useAuthStore();
  const orgId = user?.organizationId;
  const { openGlobalDock } = useChatStore();

  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const lastMemberPickerClosedRef = useRef(0);

  const [inputText, setInputText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedMentionIds, setSelectedMentionIds] = useState<Set<string>>(new Set());
  const [selectedEmoji, setSelectedEmoji] = useState(false);

  // Attachment & Screenshot upload states
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Interactive message state
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [activeMenuCommentId, setActiveMenuCommentId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [taskModalComment, setTaskModalComment] = useState<ChatMessage | null>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      pendingAttachments.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      });
    };
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveMenuCommentId(null);
    };
    if (activeMenuCommentId) {
      window.addEventListener('click', handleGlobalClick);
      return () => window.removeEventListener('click', handleGlobalClick);
    }
  }, [activeMenuCommentId]);

  // Auto-scroll to bottom on new comments
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [comments.length, systemActivities.length]);

  // Mention query
  const { data: members = [] } = useQuery({
    queryKey: ['org-members-chat-mention', orgId, mentionQuery],
    queryFn: () => (orgId ? orgService.getMembers(orgId, { search: mentionQuery, limit: 8 }) : []),
    enabled: !!orgId && showMentionMenu,
    staleTime: 1000 * 60,
  });

  const filteredMembers = members.slice(0, 6);

  // Merge & Sort Comments and System Audit Events
  const timelineItems = useMemo(() => {
    const rawItems: Array<{
      id: string;
      type: 'message' | 'system';
      date: Date;
      data: any;
    }> = [];

    comments.forEach((c) => {
      if (isActivityComment(c.body)) {
        rawItems.push({
          id: `act-${c.id}`,
          type: 'system',
          date: new Date(c.createdAt),
          data: {
            id: c.id,
            text: formatActivityText(c),
            createdAt: c.createdAt,
          },
        });
      } else {
        rawItems.push({
          id: `msg-${c.id}`,
          type: 'message',
          date: new Date(c.createdAt),
          data: c,
        });
      }
    });

    systemActivities.forEach((act) => {
      rawItems.push({
        id: `sys-${act.id}`,
        type: 'system',
        date: new Date(act.createdAt),
        data: act,
      });
    });

    // Sort chronologically
    rawItems.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Filter by search query if active
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return rawItems.filter((item) => {
        if (item.type === 'message') {
          return (
            item.data.body?.toLowerCase().includes(q) ||
            item.data.authorName?.toLowerCase().includes(q)
          );
        }
        return item.data.text?.toLowerCase().includes(q);
      });
    }

    return rawItems;
  }, [comments, systemActivities, searchQuery]);

  // Group timeline items by formatted date
  const groupedTimeline = useMemo(() => {
    const groups: { [dateStr: string]: typeof timelineItems } = {};
    timelineItems.forEach((item) => {
      let label = format(item.date, 'MMMM d, yyyy');
      if (isToday(item.date)) label = 'Today';
      else if (isYesterday(item.date)) label = 'Yesterday';

      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });
    return groups;
  }, [timelineItems]);

  // Check user permissions for editing/deleting
  const checkCanModify = (comment: ChatMessage) => {
    const isAuthor = Boolean(user?.id && comment.userId === user.id);
    const isAdmin = Boolean(
      user?.isPlatformAdmin ||
      ['org_owner', 'org_admin', 'workspace_admin', 'admin'].includes(user?.role || '')
    );
    return isAuthor || isAdmin;
  };

  // Scroll to and highlight referenced message
  const handleScrollToMessage = (refId: string | null) => {
    if (!refId) return;
    const targetEl = document.getElementById(`msg-${refId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.classList.add('ring-2', 'ring-sky-500', 'bg-sky-500/10', 'rounded-2xl');
      setTimeout(() => {
        targetEl.classList.remove('ring-2', 'ring-sky-500', 'bg-sky-500/10');
      }, 2000);
    } else {
      toast.info('Referenced message is in earlier chat history');
    }
  };

  // Handle typing & mention detection
  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    setInputText(val);

    const textBeforeCursor = val.slice(0, cursor);

    // Look for active @mention trigger immediately preceding the cursor
    // Must be preceded by start of string or whitespace
    // Followed by valid name characters without trailing space, max 25 chars
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_.-]+(?: [a-zA-Z0-9_.-]+)?)$/);

    if (match) {
      const query = match[1];
      if (query.length <= 25) {
        const matchIndex = textBeforeCursor.lastIndexOf('@' + query);
        setShowMentionMenu(true);
        setMentionQuery(query);
        setMentionStartIndex(matchIndex);
        return;
      }
    }

    // Also handle when user just typed '@' with nothing yet after it
    if (/(?:^|\s)@$/.test(textBeforeCursor)) {
      setShowMentionMenu(true);
      setMentionQuery('');
      setMentionStartIndex(textBeforeCursor.lastIndexOf('@'));
      return;
    }

    setShowMentionMenu(false);
    setMentionQuery('');
    setMentionStartIndex(-1);
  };

  const insertMention = (member: { id: string; userId?: string; name: string }) => {
    const targetUserId = member.userId || member.id;
    const beforeAt = inputText.slice(0, mentionStartIndex);
    const afterCursor = inputText.slice(
      textareaRef.current?.selectionEnd || mentionStartIndex + mentionQuery.length + 1
    );

    const mentionTag = `@${member.name} `;
    const newText = `${beforeAt}${mentionTag}${afterCursor}`;

    setInputText(newText);
    setSelectedMentionIds((prev) => new Set([...prev, targetUserId]));
    setShowMentionMenu(false);
    setMentionQuery('');
    setMentionStartIndex(-1);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const nextPos = beforeAt.length + mentionTag.length;
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 10);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionMenu) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionMenu(false);
        return;
      }
      if (filteredMembers.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredMembers.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const chosen = filteredMembers[selectedIndex];
          if (chosen) insertMention(chosen);
          return;
        }
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        setShowMentionMenu(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Add files to pending attachments tray
  const addPendingFiles = (files: File[]) => {
    const newItems: PendingAttachment[] = files.map((file) => {
      const isImg = file.type.startsWith('image/');
      return {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: isImg ? URL.createObjectURL(file) : undefined,
        name: file.name,
        size: file.size,
        type: file.type,
      };
    });

    setPendingAttachments((prev) => [...prev, ...newItems]);
    textareaRef.current?.focus();
  };

  // Remove a pending attachment before sending
  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  // Handle clipboard paste of images / screenshots / files
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    const filesToAttach: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          let finalFile = file;
          // If generic screenshot name from clipboard (image.png), give a nice descriptive timestamped name
          if (!file.name || file.name === 'image.png') {
            const timeStr = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
            finalFile = new File([file], `Screenshot_${timeStr}.png`, {
              type: file.type || 'image/png',
            });
          }
          filesToAttach.push(finalFile);
        }
      }
    }

    if (filesToAttach.length > 0) {
      e.preventDefault();
      addPendingFiles(filesToAttach);
    }
  };

  // Drag & drop handlers for composer
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addPendingFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleSend = async () => {
    if ((!inputText.trim() && pendingAttachments.length === 0) || isSending || isUploadingFiles) {
      return;
    }

    try {
      setIsUploadingFiles(true);
      const uploadedLinks: string[] = [];

      // Upload pending files if any
      if (pendingAttachments.length > 0 && onUploadAttachment) {
        for (const item of pendingAttachments) {
          try {
            const uploaded = await onUploadAttachment(item.file);
            const publicUrl = uploaded?.url;
            if (publicUrl) {
              const isImg =
                item.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(item.name);
              if (isImg) {
                uploadedLinks.push(`![${item.name}](${publicUrl})`);
              } else {
                uploadedLinks.push(`[📎 ${item.name}](${publicUrl})`);
              }
            }
          } catch (err: any) {
            console.error('Failed to upload file:', err);
            toast.error(`Failed to upload ${item.name}`);
          }
        }
      }

      // Format message body
      let bodyToSend = inputText.trim();
      if (uploadedLinks.length > 0) {
        if (bodyToSend) {
          bodyToSend = `${bodyToSend}\n\n${uploadedLinks.join('\n')}`;
        } else {
          bodyToSend = uploadedLinks.join('\n');
        }
      }

      // Attach quoted reply if active
      if (replyingTo) {
        const author = replyingTo.authorName || replyingTo.authorEmail || 'Teammate';
        const cleanQuoteSnippet = replyingTo.body
          .replace(/^>.*?\n\n/s, '')
          .trim()
          .slice(0, 120);
        bodyToSend = `> **${author}** [ref:${replyingTo.id}]: ${cleanQuoteSnippet}\n\n${bodyToSend}`;
        setReplyingTo(null);
      }

      // Clean up preview object URLs
      pendingAttachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
      setPendingAttachments([]);

      const mentionIds = Array.from(selectedMentionIds);
      setInputText('');
      setSelectedMentionIds(new Set());
      setShowMentionMenu(false);

      if (bodyToSend.trim()) {
        await onSendMessage(bodyToSend, mentionIds);
      }
    } finally {
      setIsUploadingFiles(false);
    }
  };

  // Quick Emoji helper
  const addQuickEmoji = (emoji: string) => {
    setInputText((prev) => `${prev} ${emoji} `);
    setSelectedEmoji(false);
    textareaRef.current?.focus();
  };

  // Start inline editing
  const startEditing = (comment: ChatMessage) => {
    const parsed = parseQuotedMessage(comment.body);
    setEditingCommentId(comment.id);
    setEditingText(parsed.content);
    setActiveMenuCommentId(null);
  };

  // Save inline edit
  const handleSaveEdit = async (comment: ChatMessage) => {
    if (!editingText.trim() || !onEditMessage) return;
    try {
      setIsSavingEdit(true);
      const parsed = parseQuotedMessage(comment.body);
      let updatedBody = editingText.trim();
      if (parsed.hasQuote) {
        const refStr = parsed.refId ? ` [ref:${parsed.refId}]` : '';
        updatedBody = `> **${parsed.author}**${refStr}: ${parsed.snippet}\n\n${updatedBody}`;
      }
      await onEditMessage(comment.id, updatedBody);
      setEditingCommentId(null);
      setEditingText('');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Copy message text to clipboard
  const handleCopyMessage = (comment: ChatMessage) => {
    const parsed = parseQuotedMessage(comment.body);
    navigator.clipboard.writeText(parsed.content);
    toast.success('Copied to clipboard');
    setActiveMenuCommentId(null);
  };

  // Delete message (confirmed via dialog, never native confirm())
  const handleDeleteComment = (comment: ChatMessage) => {
    if (!onDeleteMessage) return;
    setPendingDeleteId(comment.id);
    setActiveMenuCommentId(null);
  };

  const confirmDeleteComment = async () => {
    if (!onDeleteMessage || !pendingDeleteId) return;
    await onDeleteMessage(pendingDeleteId);
    setPendingDeleteId(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fbfa] dark:bg-card/90 border-l border-border/70 relative">
      {/* ─── Task Chat Header ─── */}
      {/* relative z-30: lifts the header (and its dropdowns) above the message
          rows below. Without this, the backdrop-blur traps the z-50 popover in
          a z-auto context and later-DOM relative rows paint over it. */}
      <div className="relative z-30 flex items-center justify-between px-4 py-3 border-b border-border/70 bg-card/90 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0" title={`Chat for task: ${cardTitle}`}>
            <h4 className="text-sm font-bold text-foreground truncate leading-tight">Task chat</h4>
            <p className="text-[11px] text-muted-foreground font-medium">
              {membersCount} {membersCount === 1 ? 'member' : 'members'}
            </p>
          </div>
        </div>

        {/* Top Right Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Video Call / Meet */}
          <button
            type="button"
            className="flex items-center gap-1 h-7 px-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-2xs cursor-pointer transition-colors"
            title="Start Video Meeting"
            onClick={() => {
              window.open(
                `https://meet.google.com/new?authuser=0&hs=179`,
                '_blank',
                'noopener,noreferrer'
              );
            }}
          >
            <Video className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Meet</span>
          </button>

          {/* Floating Messenger Quick Launcher */}
          <button
            type="button"
            className="flex items-center gap-1 h-7 px-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer transition-colors border border-border/60"
            title="Open Chat Messenger"
            onClick={() => openGlobalDock()}
          >
            <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
            <span className="hidden sm:inline">Chat</span>
          </button>

          {/* Add Member shortcut with directly anchored popover */}
          <div className="relative">
            <button
              type="button"
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                showMemberPicker
                  ? 'bg-primary/15 text-primary'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
              title="Add participants to task chat"
              onClick={() => {
                if (Date.now() - lastMemberPickerClosedRef.current < 200) {
                  return;
                }
                if (onAddMemberClick && !onAddParticipant) {
                  onAddMemberClick();
                } else {
                  setShowMemberPicker((prev) => !prev);
                }
              }}
            >
              <UserPlus className="w-4 h-4" />
            </button>

            {showMemberPicker && (
              <div className="absolute z-50 top-full right-0 mt-2 w-[340px] sm:w-[380px] max-w-[calc(100vw-2rem)] shadow-2xl animate-in fade-in zoom-in-95 duration-100">
                <MemberPicker
                  orgId={orgId}
                  assignedUserIds={participantUserIds || new Set()}
                  onAssign={(userId) => onAddParticipant?.(userId)}
                  onRemove={(userId) => onRemoveParticipant?.(userId)}
                  onClose={() => {
                    lastMemberPickerClosedRef.current = Date.now();
                    setShowMemberPicker(false);
                  }}
                  currentUserId={user?.id}
                  title="Add Participants"
                  mode="multiple"
                />
              </div>
            )}
          </div>

          {/* Search toggle */}
          <button
            type="button"
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
              showSearch
                ? 'bg-primary/15 text-primary'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title="Search task chat"
            onClick={() => {
              setShowSearch(!showSearch);
              if (showSearch) setSearchQuery('');
            }}
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable Search Input Bar */}
      {showSearch && (
        <div className="px-4 py-2 bg-muted/40 border-b border-border flex items-center gap-2 animate-in fade-in-50 duration-150 shrink-0">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search discussion and activity messages..."
            className="w-full bg-transparent border-none text-xs outline-none text-foreground placeholder:text-muted-foreground"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
              onClick={() => setSearchQuery('')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* ─── Chat Message & Activity Stream Timeline ─── */}
      <div
        ref={chatScrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-[radial-gradient(#00000008_1px,transparent_1px)] dark:bg-[radial-gradient(#ffffff08_1px,transparent_1px)] bg-[size:16px_16px]"
      >
        {Object.keys(groupedTimeline).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-2 text-muted-foreground/60">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-xs font-semibold text-foreground/80">No discussion messages yet</p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-[220px]">
              Type a message below or use @ to collaborate with your team on this task.
            </p>
          </div>
        ) : (
          Object.entries(groupedTimeline).map(([dateLabel, items]) => (
            <div key={dateLabel} className="space-y-3">
              {/* Date Separator Pill */}
              <div className="flex items-center justify-center my-3">
                <span className="px-3 py-0.5 rounded-full bg-muted/80 backdrop-blur-sm border border-border text-[10px] font-bold text-muted-foreground shadow-2xs tracking-wide">
                  {dateLabel}
                </span>
              </div>

              {/* Items under this date */}
              {items.map((item) => {
                if (item.type === 'system') {
                  const act = item.data;
                  return (
                    <div key={item.id} className="flex justify-center my-1.5">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/25 text-[11px] text-amber-900 dark:text-amber-200">
                        <span className="font-medium">{act.text}</span>
                        <span className="text-[9px] text-amber-700/70 dark:text-amber-400 font-mono">
                          {format(item.date, 'h:mm a')}
                        </span>
                      </div>
                    </div>
                  );
                }

                // Chat Message Bubble
                const comment: ChatMessage = item.data;
                const isCurrentUser = Boolean(user?.id && comment.userId === user.id);
                const canModify = checkCanModify(comment);
                const isEditing = editingCommentId === comment.id;
                const authorInitial = comment.authorName
                  ? comment.authorName.substring(0, 2).toUpperCase()
                  : 'U';

                // Parse quote preview if message is a reply
                const parsedQuote = parseQuotedMessage(comment.body);

                return (
                  <div
                    key={item.id}
                    id={item.id}
                    className="flex items-start gap-2.5 group relative transition-colors duration-200 rounded-xl p-1"
                  >
                    {/* User Avatar */}
                    {comment.authorAvatarUrl ? (
                      <img
                        src={comment.authorAvatarUrl}
                        alt={comment.authorName || 'Avatar'}
                        className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-border mt-0.5"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        {authorInitial}
                      </div>
                    )}

                    {/* Chat Bubble Container */}
                    <div className="flex-1 min-w-0 max-w-[92%] relative">
                      {/* Author Header */}
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer truncate">
                          {comment.authorName || comment.authorEmail || 'Teammate'}
                        </span>
                        {isCurrentUser && (
                          <span className="text-[9px] px-1 rounded bg-sky-500/15 text-sky-600 font-semibold">
                            You
                          </span>
                        )}
                        {comment.isEdited && (
                          <span className="text-[9px] text-muted-foreground/70 italic">
                            (edited)
                          </span>
                        )}
                      </div>

                      {/* Bubble Body */}
                      <div className="p-3 rounded-2xl bg-card border border-border/80 shadow-xs text-xs text-foreground space-y-2 relative">
                        {/* Interactive Quoted Reply Snippet (if message is a reply) */}
                        {parsedQuote.hasQuote && (
                          <div
                            onClick={() => handleScrollToMessage(parsedQuote.refId)}
                            className="p-2 rounded-xl bg-muted/60 dark:bg-muted/30 border-l-3 border-sky-500 text-[11px] cursor-pointer hover:bg-muted transition-colors flex items-start gap-2"
                            title={
                              parsedQuote.refId ? 'Click to jump to quoted message' : undefined
                            }
                          >
                            <CornerUpLeft className="w-3 h-3 text-sky-500 shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <span className="font-semibold text-sky-600 dark:text-sky-400 block truncate">
                                {parsedQuote.author}
                              </span>
                              <span className="text-muted-foreground truncate block">
                                {parsedQuote.snippet}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Inline Editing Mode or Markdown Body */}
                        {isEditing ? (
                          <div className="space-y-2 pt-1">
                            <textarea
                              rows={2}
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full p-2 bg-muted/40 border border-primary/50 rounded-xl text-xs outline-none focus:ring-1 focus:ring-primary text-foreground resize-none"
                              autoFocus
                            />
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingCommentId(null)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-muted-foreground hover:bg-muted cursor-pointer transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={isSavingEdit || !editingText.trim()}
                                onClick={() => handleSaveEdit(comment)}
                                className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-sky-600 hover:bg-sky-700 text-white flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                              >
                                {isSavingEdit && <Loader2 className="w-3 h-3 animate-spin" />}
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="leading-relaxed whitespace-pre-wrap break-words">
                            <MarkdownRenderer content={parsedQuote.content} />
                          </div>
                        )}

                        {/* Attachments preview if present in message */}
                        {comment.attachments && comment.attachments.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                            {comment.attachments.map((att: any) => (
                              <a
                                key={att.id}
                                href={att.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/40 hover:bg-muted border border-border text-[11px] truncate transition-colors"
                              >
                                <FileImage className="w-3.5 h-3.5 text-primary shrink-0" />
                                <span className="truncate font-medium">{att.fileName}</span>
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Timestamp & Read Receipt */}
                        <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground pt-0.5">
                          <span>{format(item.date, 'h:mm a')}</span>
                          <CheckCheck className="w-3.5 h-3.5 text-sky-500 inline shrink-0" />
                        </div>
                      </div>

                      {/* ─── Floating Quick Action Buttons on Bubble Hover ─── */}
                      <div className="absolute right-2 -top-2.5 hidden group-hover:flex items-center gap-0.5 bg-card/95 border border-border shadow-md rounded-full px-1.5 py-0.5 z-20 animate-in fade-in-50 duration-100 backdrop-blur-xs">
                        {/* Quick Reply */}
                        <button
                          type="button"
                          title="Reply to message"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReplyingTo(comment);
                            textareaRef.current?.focus();
                          }}
                          className="p-1 text-muted-foreground hover:text-sky-600 rounded-full hover:bg-muted transition-colors cursor-pointer"
                        >
                          <CornerUpLeft className="w-3.5 h-3.5" />
                        </button>

                        {/* Three Dots Menu Toggle */}
                        <button
                          type="button"
                          title="More actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuCommentId(
                              activeMenuCommentId === comment.id ? null : comment.id
                            );
                          }}
                          className="p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors cursor-pointer"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* ─── Context / Action Menu (Matches screenshot 2) ─── */}
                      {activeMenuCommentId === comment.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-2 top-6 z-40 w-52 rounded-2xl bg-card border border-border/80 shadow-2xl p-1.5 space-y-0.5 text-xs text-foreground animate-in fade-in zoom-in-95 duration-100"
                        >
                          {/* Reply */}
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingTo(comment);
                              setActiveMenuCommentId(null);
                              textareaRef.current?.focus();
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted/70 transition-colors cursor-pointer text-left"
                          >
                            <span className="font-medium">Reply</span>
                            <CornerUpLeft className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>

                          {/* Copy */}
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(comment)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted/70 transition-colors cursor-pointer text-left"
                          >
                            <span className="font-medium">Copy</span>
                            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>

                          {/* Edit (Permission Protected) */}
                          {canModify && (
                            <button
                              type="button"
                              onClick={() => startEditing(comment)}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted/70 transition-colors cursor-pointer text-left"
                            >
                              <span className="font-medium">Edit</span>
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                          )}

                          {/* Forward / Share */}
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                `${window.location.origin}#card-${cardTitle}`
                              );
                              toast.success('Task link copied to share');
                              setActiveMenuCommentId(null);
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted/70 transition-colors cursor-pointer text-left"
                          >
                            <span className="font-medium">Forward</span>
                            <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>

                          {/* Create Task From Message */}
                          <button
                            type="button"
                            onClick={() => {
                              setTaskModalComment(comment);
                              setActiveMenuCommentId(null);
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted/70 transition-colors cursor-pointer text-left"
                          >
                            <span className="font-medium">Create task</span>
                            <CheckSquare className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>

                          {/* Add to status summaries */}
                          <button
                            type="button"
                            onClick={() => {
                              toast.success('Added to task status summaries');
                              setActiveMenuCommentId(null);
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted/70 transition-colors cursor-pointer text-left"
                          >
                            <span className="font-medium">Add to status summaries</span>
                            <Flag className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>

                          {/* Delete (Permission Protected) */}
                          {canModify && (
                            <>
                              <div className="my-1 border-t border-border/50" />
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(comment)}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-red-500/10 text-red-600 dark:text-red-400 transition-colors cursor-pointer text-left font-medium"
                              >
                                <span>Delete</span>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* ─── Sticky Enterprise Chat Composer Input ─── */}
      <div className="p-3 bg-card/90 backdrop-blur-md border-t border-border/80 shrink-0 relative">
        {/* ─── Autocomplete Mentions Dropdown (Positioned safely above composer) ─── */}
        {showMentionMenu && (
          <div className="absolute z-50 bottom-full mb-2 left-3 right-3 rounded-xl border border-border bg-popover/95 backdrop-blur-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="px-3 py-1.5 bg-muted/60 border-b border-border text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1">
                <AtSign className="w-3 h-3 text-primary" /> Mention teammate
              </span>
              <span className="text-[10px] text-muted-foreground/70">
                {filteredMembers.length} found
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto p-1 divide-y divide-border/20">
              {filteredMembers.length === 0 ? (
                <div className="p-3 text-center text-xs text-muted-foreground italic">
                  No teammate found matching &ldquo;{mentionQuery}&rdquo;
                </div>
              ) : (
                filteredMembers.map((member: any, idx: number) => {
                  const isSelected = idx === selectedIndex;
                  const initials = member.name
                    ? member.name
                        .split(' ')
                        .map((n: string) => n[0])
                        .join('')
                        .substring(0, 2)
                        .toUpperCase()
                    : 'U';

                  return (
                    <div
                      key={member.id}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-primary/15 text-primary'
                          : 'hover:bg-muted/60 text-foreground'
                      }`}
                      onClick={() => insertMention(member)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt={member.name}
                          className="w-5 h-5 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">
                          {initials}
                        </div>
                      )}
                      <span className="text-xs font-semibold truncate flex-1">{member.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {member.email}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ─── Emoji Quick Picker Popover (Positioned safely above composer) ─── */}
        {selectedEmoji && (
          <div className="absolute z-50 bottom-full mb-2 right-4 p-2 rounded-xl bg-popover border border-border shadow-2xl flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100">
            {['👍', '🚀', '🔥', '✅', '❤️', '👀', '🎉', '💯'].map((emo) => (
              <button
                key={emo}
                type="button"
                className="text-lg hover:scale-125 transition-transform p-1 cursor-pointer"
                onClick={() => addQuickEmoji(emo)}
              >
                {emo}
              </button>
            ))}
          </div>
        )}

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border rounded-2xl bg-muted/20 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10 transition-all shadow-xs overflow-hidden ${
            isDragOver
              ? 'border-dashed border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/20'
              : 'border-border/80'
          }`}
        >
          {/* Active Replying-To Banner */}
          {replyingTo && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-sky-500/10 border-b border-sky-500/20 text-xs text-foreground animate-in slide-in-from-bottom-2 duration-100">
              <div className="flex items-center gap-2 min-w-0">
                <CornerUpLeft className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                <span className="font-semibold text-sky-600 dark:text-sky-400 shrink-0">
                  Replying to {replyingTo.authorName || 'Teammate'}:
                </span>
                <span className="text-muted-foreground truncate text-[11px]">
                  {replyingTo.body.replace(/^>.*?\n\n/s, '').trim()}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer transition-colors"
                title="Cancel reply"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Drag & Drop Overlay Indicator */}
          {isDragOver && (
            <div className="px-3 py-2 bg-sky-500/10 border-b border-sky-500/30 flex items-center justify-center gap-2 text-xs font-semibold text-sky-600 dark:text-sky-400 animate-in fade-in duration-100">
              <UploadCloud className="w-4 h-4 animate-bounce" />
              <span>Drop screenshots or files here to attach</span>
            </div>
          )}

          {/* Pending Attachments / Pasted Screenshots Preview Tray */}
          {pendingAttachments.length > 0 && (
            <div className="px-3 pt-2.5 pb-2 flex flex-wrap gap-2 border-b border-border/40 bg-muted/10 max-h-36 overflow-y-auto">
              {pendingAttachments.map((att) => (
                <div
                  key={att.id}
                  className="group relative flex items-center gap-2 p-1.5 pr-2 rounded-xl border border-border/80 bg-card shadow-2xs text-xs hover:border-sky-500/50 transition-all max-w-[240px]"
                >
                  {att.previewUrl ? (
                    <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-border/60 bg-muted/40 shrink-0">
                      <img
                        src={att.previewUrl}
                        alt={att.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[11px] font-semibold text-foreground truncate leading-snug"
                      title={att.name}
                    >
                      {att.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {Math.max(1, Math.round(att.size / 1024))} KB
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => removePendingAttachment(att.id)}
                    className="w-5 h-5 rounded-full bg-muted/80 hover:bg-red-500 hover:text-white text-muted-foreground flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    title="Remove file"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Main Input Textarea */}
          <textarea
            ref={textareaRef}
            rows={2}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              pendingAttachments.length > 0
                ? 'Add an optional note or press Enter to send...'
                : 'Type @ to mention, paste screenshots (Cmd+V), or write a message...'
            }
            className="w-full p-3 bg-transparent border-0 outline-none text-xs leading-relaxed resize-none placeholder:text-muted-foreground/80 text-foreground"
          />

          {/* Composer Bottom Action Bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-t border-border/50 text-xs">
            {/* Left Tools: Attachment & Mention */}
            <div className="flex items-center gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    addPendingFiles(files);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                className="relative w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
                title="Attach files or paste screenshots"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="w-4 h-4" />
                {pendingAttachments.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-sky-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {pendingAttachments.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                className="w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary flex items-center justify-center transition-colors cursor-pointer"
                title="Mention teammate"
                onClick={() => {
                  const current = inputText;
                  const pos = textareaRef.current?.selectionStart || current.length;
                  const newText = `${current.slice(0, pos)}@${current.slice(pos)}`;
                  setInputText(newText);
                  setMentionStartIndex(pos);
                  setShowMentionMenu(true);
                  setMentionQuery('');
                  setTimeout(() => {
                    textareaRef.current?.focus();
                    textareaRef.current?.setSelectionRange(pos + 1, pos + 1);
                  }, 10);
                }}
              >
                <AtSign className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right Tools: Emoji, Send */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="w-7 h-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
                title="Quick emojis"
                onClick={() => setSelectedEmoji(!selectedEmoji)}
              >
                <Smile className="w-4 h-4" />
              </button>

              {/* Circular Blue Send Button */}
              <button
                type="button"
                disabled={
                  (!inputText.trim() && pendingAttachments.length === 0) ||
                  isSending ||
                  isUploadingFiles
                }
                onClick={handleSend}
                className="w-7 h-7 rounded-full bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs disabled:cursor-not-allowed"
                title={isUploadingFiles ? 'Uploading attachments...' : 'Send message'}
              >
                {isSending || isUploadingFiles ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 translate-x-px" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Delete Message Confirmation ─── */}
      <ConfirmDialog
        open={!!pendingDeleteId}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Delete this message?"
        description="The message will be permanently removed for everyone. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDeleteComment}
      />

      {/* ─── Create Task From Message Modal ─── */}
      <CreateTaskFromMessageModal
        isOpen={!!taskModalComment}
        onClose={() => setTaskModalComment(null)}
        comment={taskModalComment}
        cardTitle={cardTitle}
        boardId={boardId}
        defaultListId={defaultListId}
      />
    </div>
  );
}
