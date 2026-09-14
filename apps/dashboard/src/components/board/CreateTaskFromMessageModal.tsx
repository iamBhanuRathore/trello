import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Flame,
  Quote,
  User as UserIcon,
  Calendar as CalendarIcon,
  ListTodo,
  CheckSquare,
  Paperclip,
  Folder,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boardly/ui/select';
import { orgService } from '../../lib/orgService';
import { useAuthStore } from '../../store/authStore';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import type { ChatMessage } from './TaskChatPane';

interface CreateTaskFromMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  comment: ChatMessage | null;
  cardTitle: string;
  boardId?: string;
  defaultListId?: string;
  onTaskCreated?: (card: any) => void;
}

export function CreateTaskFromMessageModal({
  isOpen,
  onClose,
  comment,
  cardTitle,
  boardId,
  defaultListId,
  onTaskCreated,
}: CreateTaskFromMessageModalProps) {
  useEscapeKey(onClose, isOpen);

  const { user } = useAuthStore();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [targetListId, setTargetListId] = useState<string>('');
  const [isUrgent, setIsUrgent] = useState(false);

  // Fetch board lists
  const { data: lists = [] } = useQuery<Array<{ id: string; name: string; position: number }>>({
    queryKey: ['lists', boardId],
    queryFn: async () => (await api.get(`/lists?boardId=${boardId}`)).data,
    enabled: !!boardId && isOpen,
  });

  // Fetch organization members for assignee selector
  const { data: members = [] } = useQuery({
    queryKey: ['org-members-task-modal', orgId],
    queryFn: () => (orgId ? orgService.getMembers(orgId, { limit: 50 }) : []),
    enabled: !!orgId && isOpen,
    staleTime: 1000 * 60 * 5,
  });

  // Initialize form state when comment changes
  useEffect(() => {
    if (comment && isOpen) {
      // Clean comment text from existing markdown quotes if any
      const rawText = comment.body.replace(/^>.*?\n\n/s, '').trim();
      // Generate clean title preview from first line or snippet
      const firstLine = rawText.split('\n')[0] || '';
      const cleanSnippet = firstLine.length > 70 ? `${firstLine.substring(0, 67)}...` : firstLine;
      setTitle(cleanSnippet || `Follow up: ${cardTitle}`);

      // Default assignee to comment author or current user
      if (comment.userId) {
        setAssigneeId(comment.userId);
      } else if (user?.id) {
        setAssigneeId(user.id);
      }

      // Default list to defaultListId or first list
      if (defaultListId) {
        setTargetListId(defaultListId);
      } else if (lists.length > 0 && !targetListId) {
        setTargetListId(lists[0].id);
      }

      // Default deadline to 3 days ahead at 6:30 PM
      const targetDeadline = new Date();
      targetDeadline.setDate(targetDeadline.getDate() + 3);
      targetDeadline.setHours(18, 30, 0, 0);
      setDueDate(format(targetDeadline, "yyyy-MM-dd'T'HH:mm"));
      setIsUrgent(false);
    }
  }, [comment, isOpen, cardTitle, defaultListId, lists]);

  // Keep target list synced if lists load after modal opens
  useEffect(() => {
    if (lists.length > 0 && !targetListId) {
      setTargetListId(defaultListId || lists[0].id);
    }
  }, [lists, defaultListId, targetListId]);

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!targetListId) {
        throw new Error('Please select a list for the new task');
      }
      if (!title.trim()) {
        throw new Error('Please enter a task name');
      }

      const cleanBody = comment?.body.replace(/^>.*?\n\n/s, '').trim() || '';
      const contextDescription = `**Created from Chat in:** ${cardTitle}\n**Author:** ${
        comment?.authorName || 'Teammate'
      }\n\n> ${cleanBody}`;

      const payload: any = {
        listId: targetListId,
        title: title.trim(),
        description: contextDescription,
        assigneeId: assigneeId || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        storyPoints: isUrgent ? 5 : undefined,
      };

      const res = await api.post('/cards', payload);
      return res.data;
    },
    onSuccess: (newCard) => {
      queryClient.invalidateQueries({ queryKey: ['cards', boardId] });
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      toast.success('Task created successfully');
      if (onTaskCreated) {
        onTaskCreated(newCard);
      }
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to create task');
    },
  });

  if (!isOpen || !comment) return null;

  const rawCommentText = comment.body.replace(/^>.*?\n\n/s, '').trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card w-full max-w-lg rounded-2xl border border-border/80 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header & Task Title Input */}
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task name"
              autoFocus
              className="w-full text-lg font-semibold text-foreground bg-transparent border-0 outline-none placeholder:text-muted-foreground/60 focus:ring-0 px-0"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsUrgent(!isUrgent)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isUrgent
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                    : 'text-muted-foreground/60 hover:text-amber-500 hover:bg-muted'
                }`}
                title={isUrgent ? 'Marked as urgent' : 'Mark as urgent'}
              >
                <Flame className={`w-4 h-4 ${isUrgent ? 'fill-amber-500' : ''}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quoted Message Context Block (matches screenshot) */}
          <div className="rounded-xl bg-muted/40 border border-border/60 p-3.5 flex items-start gap-3 relative">
            <Quote className="w-4 h-4 text-muted-foreground/70 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 text-xs">
              <div className="font-medium text-foreground">
                <span className="text-muted-foreground font-normal">Chat: </span>
                <span className="text-sky-600 dark:text-sky-400 font-semibold">{cardTitle}</span>
              </div>
              <div className="font-bold text-foreground mt-1">
                {comment.authorName || comment.authorEmail || 'Teammate'}
              </div>
              <p className="text-muted-foreground mt-0.5 line-clamp-3 leading-relaxed whitespace-pre-wrap break-words">
                {rawCommentText}
              </p>
            </div>
          </div>
        </div>

        {/* Task Form Properties (Assignee, Deadline, List) */}
        <div className="px-5 py-3 space-y-3.5 border-t border-border/40 text-xs">
          {/* Assignee Field */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-muted-foreground font-medium w-24 shrink-0">
              <UserIcon className="w-3.5 h-3.5" />
              <span>Assignee:</span>
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger className="w-full border-border/70 bg-muted/30 hover:bg-muted/60">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {members.map((m: any) => {
                    const uid = m.userId || m.id;
                    return (
                      <SelectItem key={uid} value={uid}>
                        {m.name || m.email} {m.userId === user?.id ? '(You)' : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Deadline Field */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-muted-foreground font-medium w-24 shrink-0">
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Deadline:</span>
            </div>
            <div className="flex-1 min-w-0">
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-muted/30 hover:bg-muted/60 border border-border/70 rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary transition-colors cursor-pointer"
              />
            </div>
          </div>

          {/* List Destination Field */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-muted-foreground font-medium w-24 shrink-0">
              <ListTodo className="w-3.5 h-3.5" />
              <span>List:</span>
            </div>
            <div className="flex-1 min-w-0">
              <Select value={targetListId} onValueChange={setTargetListId}>
                <SelectTrigger className="w-full border-border/70 bg-muted/30 hover:bg-muted/60">
                  <SelectValue placeholder="Select list" />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quick Pill Toggles (Files, Checklists, Project) */}
          <div className="flex items-center gap-2 pt-1 text-[11px]">
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/40 border border-border text-muted-foreground">
              <Paperclip className="w-3 h-3" />
              <span>Files</span>
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/40 border border-border text-muted-foreground">
              <CheckSquare className="w-3 h-3" />
              <span>Checklists</span>
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/40 border border-border text-muted-foreground">
              <Folder className="w-3 h-3" />
              <span>Project</span>
            </div>
          </div>
        </div>

        {/* Modal Action Footer (matches screenshot) */}
        <div className="p-4 bg-muted/20 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={createTaskMutation.isPending || !title.trim()}
              onClick={() => createTaskMutation.mutate()}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
            >
              {createTaskMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Create</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
          <span className="text-[11px] text-muted-foreground font-medium">Quick create</span>
        </div>
      </div>
    </div>
  );
}
