import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { stagesService } from '../../lib/stagesService';
import { sprintsService } from '../../lib/sprintsService';
import { phasesService } from '../../lib/phasesService';
import { logCardTime, getCardTimeLogs, deleteTimeLog } from '../../lib/api';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import {
  Paperclip,
  CheckSquare,
  MessageSquare,
  Trash2,
  Clock,
  Plus,
  Maximize2,
  Minimize2,
  Copy,
  UserPlus,
  ArrowLeft,
  Bold,
  Italic,
  Code,
  List as ListIcon,
  Quote,
  AlertCircle,
  AlertTriangle,
  Save,
  Edit3,
  FileText,
  X,
  ExternalLink,
  Layers,
  Users,
  Eye,
  EyeOff,
  User,
  MoreHorizontal,
  Share2,
  CopyPlus,
  PlusCircle,
  GitBranch,
  Tag,
  Archive,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@boardly/ui/dropdown-menu';
import { MemberPicker } from './MemberPicker';
import { LabelPicker } from './LabelPicker';
import { MentionCommentBox } from './MentionCommentBox';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { SearchableSelect, ListSearchableSelect } from '../ui/SearchableSelect';
import { ShareTaskModal } from './ShareTaskModal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { toast } from 'sonner';
import { usePageMetadata } from '../../hooks/usePageMetadata';
import {
  getTaskIdentifier,
  getGitBranchName,
  copyTextToClipboard,
} from '../../utils/taskIdentifier';

export interface TaskDetailViewHandle {
  requestClose: () => void;
  isDirty: () => boolean;
}

interface TaskDetailViewProps {
  cardId: string;
  mode?: 'modal' | 'page';
  onClose?: () => void;
  onSelectCard?: (id: string) => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export const TaskDetailView = forwardRef<TaskDetailViewHandle, TaskDetailViewProps>(
  function TaskDetailView(
    { cardId, mode = 'modal', onClose, onSelectCard, onDirtyChange }: TaskDetailViewProps,
    ref
  ) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const orgId = user?.organizationId;

  // Local UI States
  const [descTab, setDescTab] = useState<'write' | 'preview'>('preview');
  const [descriptionValue, setDescriptionValue] = useState<string>('');
  const [isDescDirty, setIsDescDirty] = useState<boolean>(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [isLoggingTime, setIsLoggingTime] = useState<boolean>(false);
  const [logHours, setLogHours] = useState<string>('');
  const [logMinutes, setLogMinutes] = useState<string>('');
  const [logDescription, setLogDescription] = useState<string>('');
  const [logIsBillable, setLogIsBillable] = useState<boolean>(true);
  const [logDate, setLogDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showAssigneePicker, setShowAssigneePicker] = useState<boolean>(false);
  const [showParticipantPicker, setShowParticipantPicker] = useState<boolean>(false);
  const [showWatcherPicker, setShowWatcherPicker] = useState<boolean>(false);
  const [showLabelPicker, setShowLabelPicker] = useState<boolean>(false);
  const [showNewChecklist, setShowNewChecklist] = useState<boolean>(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState<string>('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState<string>('');
  const [newSubtaskAssigneeId, setNewSubtaskAssigneeId] = useState<string>('');
  const [subtaskFilter, setSubtaskFilter] = useState<'all' | 'mine'>('all');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<boolean>(false);
  const [copiedBranch, setCopiedBranch] = useState<boolean>(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  // Queries
  const { data: card, isLoading: isCardLoading } = useQuery({
    queryKey: ['card', cardId],
    queryFn: async () => {
      const res = await api.get(`/cards/${cardId}`);
      if (!isDescDirty) {
        setDescriptionValue(res.data.description || '');
      }
      return res.data;
    },
    enabled: !!cardId,
  });

  const taskIdentifier = getTaskIdentifier(card);

  // Dynamic OpenGraph / Teams / Slack metadata and title
  usePageMetadata({
    title: card ? `${taskIdentifier}: ${card.title} · ${card.boardName || 'Boardly'}` : 'Task Details · Boardly',
    description: card?.description
      ? `${card.description.slice(0, 200)} [Status: ${card.listName || 'In Progress'}]`
      : `View task ${taskIdentifier} on Boardly enterprise workspace.`,
    url: typeof window !== 'undefined' ? `${window.location.origin}/cards/${cardId}` : undefined,
  });

  // Smart-default subtask assignee to primary ticket owner or current user
  useEffect(() => {
    if (card?.assignee?.id) {
      setNewSubtaskAssigneeId(card.assignee.id);
    } else if (user?.id) {
      setNewSubtaskAssigneeId(user.id);
    }
  }, [card?.assignee?.id, user?.id]);

  const { data: lists } = useQuery({
    queryKey: ['lists', card?.boardId],
    queryFn: async () => (await api.get(`/lists?boardId=${card?.boardId}`)).data,
    enabled: !!card?.boardId,
  });

  const { data: comments } = useQuery({
    queryKey: ['card', cardId, 'comments'],
    queryFn: async () => (await api.get(`/cards/${cardId}/comments`)).data,
    enabled: !!cardId,
  });

  const { data: checklists } = useQuery({
    queryKey: ['card', cardId, 'checklists'],
    queryFn: async () => (await api.get(`/cards/${cardId}/checklists`)).data,
    enabled: !!cardId,
  });

  const { data: attachments } = useQuery({
    queryKey: ['card', cardId, 'attachments'],
    queryFn: async () => (await api.get(`/cards/${cardId}/attachments`)).data,
    enabled: !!cardId,
  });

  const { data: subtasks } = useQuery({
    queryKey: ['card', cardId, 'subtasks'],
    queryFn: async () => (await api.get(`/cards/${cardId}/subtasks`)).data,
    enabled: !!cardId,
  });

  const { data: timeTrackingData } = useQuery({
    queryKey: ['card', cardId, 'time-logs'],
    queryFn: () => getCardTimeLogs(cardId),
    enabled: !!cardId,
  });

  const { data: stageTemplates } = useQuery({
    queryKey: ['stageTemplatesWithStages', orgId],
    queryFn: async () => {
      const ts = await stagesService.getTemplates(orgId!);
      if (ts.length > 0) {
        const fullTemplate = await stagesService.getTemplate(ts[0].id);
        ts[0].stages = fullTemplate.stages;
      }
      return ts;
    },
    enabled: !!orgId,
  });

  const { data: sprints } = useQuery({
    queryKey: ['sprints', card?.projectId],
    queryFn: () => sprintsService.getSprints(card!.projectId),
    enabled: !!card?.projectId,
  });

  const { data: phases } = useQuery({
    queryKey: ['phases', card?.projectId],
    queryFn: () => phasesService.getPhases(card!.projectId),
    enabled: !!card?.projectId,
  });

  // Mutations
  const updateCardMutation = useMutation({
    mutationFn: async (data: any) => await api.patch(`/cards/${cardId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      queryClient.invalidateQueries({ queryKey: ['lists', card?.boardId] });
    },
  });

  const moveCardMutation = useMutation({
    mutationFn: async (listId: string) =>
      await api.patch(`/cards/${cardId}/move`, { listId, position: 65536 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      queryClient.invalidateQueries({ queryKey: ['lists', card?.boardId] });
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: async () => await api.delete(`/cards/${cardId}`),
    onSuccess: () => {
      toast.success('Task card permanently deleted');
      queryClient.invalidateQueries({ queryKey: ['lists', card?.boardId] });
      if (mode === 'page') {
        navigate(`/b/${card?.boardId}`);
      } else {
        onClose?.();
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to delete task card');
    },
  });

  const archiveCardMutation = useMutation({
    mutationFn: async () => await api.post(`/cards/${cardId}/archive`),
    onSuccess: () => {
      toast.success('Task card archived');
      queryClient.invalidateQueries({ queryKey: ['lists', card?.boardId] });
      if (mode === 'page') {
        navigate(`/b/${card?.boardId}`);
      } else {
        onClose?.();
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to archive task card');
    },
  });

  const assignUserMutation = useMutation({
    mutationFn: async (userId: string) => await api.post(`/cards/${cardId}/assignees`, { userId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card', cardId] }),
  });

  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => await api.delete(`/cards/${cardId}/assignees/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card', cardId] }),
  });

  const addParticipantMutation = useMutation({
    mutationFn: async (userId: string) => await api.post(`/cards/${cardId}/participants`, { userId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card', cardId] }),
  });

  const removeParticipantMutation = useMutation({
    mutationFn: async (userId: string) => await api.delete(`/cards/${cardId}/participants/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card', cardId] }),
  });

  const watchCardMutation = useMutation({
    mutationFn: async (userId?: string) => await api.post(`/cards/${cardId}/watch`, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      queryClient.invalidateQueries({ queryKey: ['card-watchers', cardId] });
    },
  });

  const unwatchCardMutation = useMutation({
    mutationFn: async (userId?: string) => await api.post(`/cards/${cardId}/unwatch`, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      queryClient.invalidateQueries({ queryKey: ['card-watchers', cardId] });
    },
  });

  const toggleLabelMutation = useMutation({
    mutationFn: async ({ labelId, hasLabel }: { labelId: string; hasLabel: boolean }) => {
      if (hasLabel) {
        await api.delete(`/cards/${cardId}/labels/${labelId}`);
      } else {
        await api.post(`/cards/${cardId}/labels`, { labelId });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card', cardId] }),
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({
      body,
      mentionedUserIds,
    }: {
      body: string;
      mentionedUserIds?: string[];
    }) => await api.post(`/cards/${cardId}/comments`, { body, mentionedUserIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId, 'comments'] });
      queryClient.invalidateQueries({ queryKey: ['card-watchers', cardId] });
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
    },
  });

  const addChecklistMutation = useMutation({
    mutationFn: async (title: string) =>
      await api.post(`/cards/${cardId}/checklists`, { title, position: 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId, 'checklists'] });
      setNewChecklistTitle('');
      setShowNewChecklist(false);
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async ({ checklistId, text }: { checklistId: string; text: string }) =>
      await api.post(`/cards/checklists/${checklistId}/items`, { text, position: 0 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card', cardId, 'checklists'] }),
  });

  const toggleItemMutation = useMutation({
    mutationFn: async ({ itemId, isDone }: { itemId: string; isDone: boolean }) =>
      await api.patch(`/cards/checklist-items/${itemId}`, { isDone }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card', cardId, 'checklists'] }),
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: async (file: File) => {
      const res = await api.post(`/cards/${cardId}/attachments`, {
        fileName: file.name,
        fileType: file.type,
        sizeBytes: file.size,
      });
      const { uploadUrl, attachment } = res.data;
      if (uploadUrl) {
        await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
      }
      return attachment;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card', cardId, 'attachments'] }),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) =>
      await api.delete(`/cards/${cardId}/attachments/${attachmentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card', cardId, 'attachments'] }),
  });

  const addSubtaskMutation = useMutation({
    mutationFn: async ({ title, assigneeId }: { title: string; assigneeId?: string }) => {
      if (!card) return;
      return await api.post(`/cards`, {
        listId: card.listId,
        title,
        parentCardId: cardId,
        assigneeId: assigneeId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId, 'subtasks'] });
      setNewSubtaskTitle('');
      if (card?.assignee?.id) {
        setNewSubtaskAssigneeId(card.assignee.id);
      } else if (user?.id) {
        setNewSubtaskAssigneeId(user.id);
      }
    },
  });

  const logTimeMutation = useMutation({
    mutationFn: async () => {
      const totalMins = (Number(logHours) || 0) * 60 + (Number(logMinutes) || 0);
      if (totalMins <= 0) return;
      return await logCardTime(cardId, {
        minutes: totalMins,
        description: logDescription || undefined,
        loggedDate: logDate,
        isBillable: logIsBillable,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId, 'time-logs'] });
      setIsLoggingTime(false);
      setLogHours('');
      setLogMinutes('');
      setLogDescription('');
    },
  });

  const deleteTimeLogMutation = useMutation({
    mutationFn: (id: string) => deleteTimeLog(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card', cardId, 'time-logs'] }),
  });

  const cloneCardMutation = useMutation({
    mutationFn: async (vars: { parentCardId?: string; title?: string }) => {
      const res = await api.post(`/cards/${cardId}/clone`, {
        listId: card?.listId,
        parentCardId: vars.parentCardId,
        title: vars.title,
      });
      return res.data;
    },
    onSuccess: (clonedCard, vars) => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      if (card?.boardId) {
        queryClient.invalidateQueries({ queryKey: ['lists', card.boardId] });
      }
      if (vars.parentCardId) {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'subtasks'] });
      }
      if (!vars.parentCardId && clonedCard?.id) {
        if (onSelectCard) {
          onSelectCard(clonedCard.id);
        } else if (mode === 'page') {
          navigate(`/cards/${clonedCard.id}`);
        }
      }
    },
  });

  const handleCloneTask = () => {
    cloneCardMutation.mutate({
      title: `${card?.title || 'Task'} (Copy)`,
    });
  };

  const handleCloneAsSubtask = () => {
    cloneCardMutation.mutate({
      parentCardId: cardId,
      title: `Subtask: ${card?.title || 'Task'}`,
    });
  };

  const handleCreateSubtask = () => {
    const input = document.getElementById('new-subtask-input') as HTMLInputElement;
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => input.focus(), 250);
    }
  };

  // Save description helper
  const handleSaveDescription = async () => {
    if (descriptionValue !== (card?.description || '')) {
      await updateCardMutation.mutateAsync({ description: descriptionValue });
    }
    setIsDescDirty(false);
    onDirtyChange?.(false);
    setDescTab('preview');
  };

  // Discard description helper
  const handleDiscardDescription = () => {
    setDescriptionValue(card?.description || '');
    setIsDescDirty(false);
    onDirtyChange?.(false);
    setDescTab('preview');
  };

  // Intercept navigation or closing if dirty
  const handleAttemptAction = useCallback((action: () => void) => {
    if (isDescDirty) {
      setPendingAction(() => action);
      setShowUnsavedPrompt(true);
    } else {
      action();
    }
  }, [isDescDirty]);

  const handleAttemptClose = useCallback(() => {
    handleAttemptAction(() => onClose?.());
  }, [handleAttemptAction, onClose]);

  useImperativeHandle(
    ref,
    () => ({
      requestClose: handleAttemptClose,
      isDirty: () => isDescDirty,
    }),
    [handleAttemptClose, isDescDirty]
  );

  // Protect browser tab reload / close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDescDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDescDirty]);

  // Markdown format helper
  const insertMarkdown = (prefix: string, suffix: string = '') => {
    const textarea = document.getElementById('card-description-editor') as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = textarea.value;
    const selected = current.substring(start, end);
    const replacement = `${prefix}${selected || 'text'}${suffix}`;
    const nextVal = current.substring(0, start) + replacement + current.substring(end);
    setDescriptionValue(nextVal);
    const dirty = nextVal !== (card?.description || '');
    setIsDescDirty(dirty);
    onDirtyChange?.(dirty);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + (selected.length || 4)
      );
    }, 0);
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/cards/${cardId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (isCardLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Loading task details...</p>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-3" />
        <h3 className="text-lg font-bold">Task not found</h3>
        <p className="text-sm text-muted-foreground mt-1">
          This card may have been deleted or archived.
        </p>
        {mode === 'page' && (
          <Button className="mt-4" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        )}
      </div>
    );
  }

  const assignedUserIds = new Set<string>(
    card?.assignee?.id
      ? [card.assignee.id]
      : card?.assignees?.map((a: any) => a.id) || []
  );
  const participantUserIds = new Set<string>(
    card?.participants?.map((p: any) => p.id) || []
  );
  const watcherUserIds = new Set<string>(
    card?.watchers?.map((w: any) => w.id) || []
  );
  const cardLabelIds = new Set<string>(card?.labels?.map((l: any) => l.id) || []);
  const isCurrentUserWatching = user?.id ? watcherUserIds.has(user.id) : false;

  // Subtasks Filtered
  const filteredSubtasks =
    subtasks?.filter((s: any) => {
      if (subtaskFilter === 'mine') {
        const subAssigneeId = s.assignee?.id || s.assignees?.[0]?.id;
        return subAssigneeId === user?.id;
      }
      return true;
    }) || [];
  const mySubtasksCount =
    subtasks?.filter((s: any) => {
      const subAssigneeId = s.assignee?.id || s.assignees?.[0]?.id;
      return subAssigneeId === user?.id;
    }).length || 0;

  const totalLoggedMinutes = timeTrackingData?.totalMinutes || 0;
  const estimateMinutes = card.estimateMinutes || 0;
  const timeProgressPercent =
    estimateMinutes > 0
      ? Math.min(100, Math.round((totalLoggedMinutes / estimateMinutes) * 100))
      : 0;

  const isDueOverdue = card.dueDate && isPast(new Date(card.dueDate));

  return (
    <div
      className={`relative flex flex-col h-full bg-card text-foreground overflow-hidden ${
        mode === 'page' ? 'max-w-6xl mx-auto rounded-2xl shadow-sm border border-border' : ''
      }`}
    >
      {/* ─── Top Bar: Navigation & Action Header (Fixed at top) ─── */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-border shrink-0 bg-card/90 backdrop-blur-md z-10">
        {/* Left: Breadcrumbs / Path & Friendly Task ID */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-hidden flex-wrap">
          {mode === 'page' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs font-semibold gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => (card.boardId ? navigate(`/b/${card.boardId}`) : navigate(-1))}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
          )}

          {card.boardName && (
            <>
              <span
                className="font-semibold text-foreground/80 hover:text-foreground cursor-pointer truncate max-w-[180px]"
                onClick={() => navigate(`/b/${card.boardId}`)}
              >
                {card.boardName}
              </span>
              <span>/</span>
            </>
          )}

          {/* List switcher dropdown */}
          <div className="relative inline-flex items-center">
            <ListSearchableSelect
              lists={lists || []}
              value={card.listId}
              onChange={(val) => moveCardMutation.mutate(val)}
              size="sm"
              triggerClassName="h-6 py-0 px-2 text-xs bg-muted/50 hover:bg-muted font-medium"
              className="w-auto min-w-[110px]"
            />
          </div>

          {/* User-Friendly Task Identifier Pill */}
          <div
            onClick={async () => {
              const ok = await copyTextToClipboard(taskIdentifier);
              if (ok) {
                setCopiedId(true);
                setTimeout(() => setCopiedId(false), 2000);
              }
            }}
            className="px-2 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 font-mono font-bold text-xs cursor-pointer transition-all flex items-center gap-1 shrink-0 select-none"
            title={`Click to copy Task ID (${taskIdentifier})`}
          >
            <Tag className="w-3 h-3 opacity-70" />
            <span>{copiedId ? 'Copied ID!' : taskIdentifier}</span>
          </div>
        </div>

        {/* Right: Quick Action Controls & Three-Dot Dropdown */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Share Button (Rich Modal) */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-xs text-foreground gap-1.5 cursor-pointer hover:bg-muted font-medium"
            onClick={() => setShowShareModal(true)}
            title="Share task & copy links"
          >
            <Share2 className="w-3.5 h-3.5 text-primary" />
            <span>Share</span>
          </Button>

          {/* Three-Dot Menu with All Task Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Task options & actions"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56 p-1.5">
              <div className="px-2 py-1.5 bg-muted/50 rounded-md border border-border/60 mb-1 flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-foreground">{taskIdentifier}</span>
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Identifier</span>
              </div>

              <DropdownMenuItem
                onClick={async () => {
                  await copyTextToClipboard(taskIdentifier);
                  setCopiedId(true);
                  setTimeout(() => setCopiedId(false), 2000);
                }}
                className="cursor-pointer text-xs gap-2"
              >
                <Tag className="w-3.5 h-3.5 text-primary" />
                <span>Copy Task ID</span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">{taskIdentifier}</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={handleCopyLink}
                className="cursor-pointer text-xs gap-2"
              >
                <Copy className="w-3.5 h-3.5 text-primary" />
                <span>{copiedLink ? 'Copied Link!' : 'Copy Task Link'}</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={async () => {
                  const branch = getGitBranchName(taskIdentifier, card.title);
                  await copyTextToClipboard(`git checkout -b ${branch}`);
                  setCopiedBranch(true);
                  setTimeout(() => setCopiedBranch(false), 2000);
                }}
                className="cursor-pointer text-xs gap-2"
              >
                <GitBranch className="w-3.5 h-3.5 text-primary" />
                <span>{copiedBranch ? 'Copied Branch!' : 'Copy Git Branch'}</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={handleCloneTask}
                disabled={cloneCardMutation.isPending}
                className="cursor-pointer text-xs gap-2"
              >
                <CopyPlus className="w-3.5 h-3.5 text-emerald-500" />
                <span>Clone Task</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={handleCreateSubtask}
                className="cursor-pointer text-xs gap-2"
              >
                <PlusCircle className="w-3.5 h-3.5 text-indigo-500" />
                <span>Create Subtask</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={handleCloneAsSubtask}
                disabled={cloneCardMutation.isPending}
                className="cursor-pointer text-xs gap-2"
              >
                <Layers className="w-3.5 h-3.5 text-amber-500" />
                <span>Clone & Create Subtask</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => setShowShareModal(true)}
                className="cursor-pointer text-xs gap-2"
              >
                <Share2 className="w-3.5 h-3.5 text-sky-500" />
                <span>Share & Embed Links...</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => setShowArchiveConfirm(true)}
                className="cursor-pointer text-xs gap-2"
              >
                <Archive className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Archive Task</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                variant="destructive"
                className="cursor-pointer text-xs gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Task</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {mode === 'modal' ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={() =>
                handleAttemptAction(() => {
                  onClose?.();
                  navigate(`/cards/${cardId}`);
                })
              }
              title="Open as full screen page"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={() => handleAttemptAction(() => navigate(`/b/${card.boardId}`))}
              title="Return to Kanban view"
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
          )}

          {mode === 'modal' && onClose && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={handleAttemptClose}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ─── Two-Column Split Layout with Independent Scrolling ─── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* ─── LEFT COLUMN: Main Task Body (Scrollable) ─── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 min-w-0">
          {/* Parent Card Banner (if subtask) */}
          {card.parentCard && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 rounded-lg text-xs cursor-pointer hover:bg-muted/70 transition-colors"
              onClick={() =>
                onSelectCard
                  ? onSelectCard(card.parentCard.id)
                  : navigate(`/cards/${card.parentCard.id}`)
              }
            >
              <Layers className="w-3.5 h-3.5 text-primary" />
              <span className="text-muted-foreground">Subtask of</span>
              <span className="font-semibold text-foreground underline">{card.parentCard.title}</span>
            </div>
          )}

          {/* Main Editable Title Header */}
          <div>
            <input
              type="text"
              className="w-full text-xl sm:text-2xl font-bold bg-transparent border-b border-transparent hover:border-border focus:border-ring focus:bg-muted/20 rounded-md px-1 py-1 outline-none transition-colors text-foreground"
              defaultValue={card.title}
              placeholder="Task title..."
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== card.title) {
                  updateCardMutation.mutate({ title: e.target.value.trim() });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
            />
          </div>

          {/* 1. Description with Markdown Write / Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-semibold">Description</Label>
                {isDescDirty && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-semibold flex items-center gap-1.5 border border-amber-500/20 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Unsaved changes
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {descTab === 'preview' && descriptionValue?.trim() && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => setDescTab('write')}
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </Button>
                )}
                <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border border-border">
                  <button
                    type="button"
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                      descTab === 'write'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setDescTab('write')}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                      descTab === 'preview'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setDescTab('preview')}
                  >
                    Preview
                  </button>
                </div>
              </div>
            </div>

            {descTab === 'write' ? (
              <div className="border border-border rounded-xl bg-muted/20 overflow-hidden focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-all">
                {/* Markdown Quick Toolbar */}
                <div className="flex items-center gap-1 p-1.5 bg-muted/40 border-b border-border text-muted-foreground">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => insertMarkdown('**', '**')}
                    title="Bold"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => insertMarkdown('*', '*')}
                    title="Italic"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => insertMarkdown('### ')}
                    title="Heading"
                  >
                    <span className="text-xs font-bold font-mono">H</span>
                  </Button>
                  <div className="w-[1px] h-4 bg-border mx-1" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => insertMarkdown('`', '`')}
                    title="Code"
                  >
                    <Code className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => insertMarkdown('- ')}
                    title="Bullet list"
                  >
                    <ListIcon className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => insertMarkdown('- [ ] ')}
                    title="Task list item"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => insertMarkdown('> ')}
                    title="Quote"
                  >
                    <Quote className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <textarea
                  id="card-description-editor"
                  className="w-full min-h-[140px] p-3.5 bg-transparent border-0 outline-none text-sm leading-relaxed resize-y placeholder:text-muted-foreground"
                  placeholder="Add a rich Markdown description, acceptance criteria, notes..."
                  value={descriptionValue}
                  onChange={(e) => {
                    setDescriptionValue(e.target.value);
                    const dirty = e.target.value !== (card?.description || '');
                    setIsDescDirty(dirty);
                    onDirtyChange?.(dirty);
                  }}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveDescription();
                    }
                  }}
                />
                <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/30 border-t border-border/60 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    Markdown supported • <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">⌘/Ctrl+Enter</kbd> to save
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                      onClick={handleDiscardDescription}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs px-3 gap-1.5 cursor-pointer font-semibold"
                      disabled={updateCardMutation.isPending}
                      onClick={handleSaveDescription}
                    >
                      <Save className="w-3.5 h-3.5" />
                      {updateCardMutation.isPending ? 'Saving...' : 'Save description'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-h-[140px]">
                {descriptionValue?.trim() ? (
                  <div
                    className="p-4 rounded-xl border border-border bg-muted/20 min-h-[140px] text-sm text-foreground hover:border-border/80 transition-colors cursor-text"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.tagName !== 'A' && target.tagName !== 'INPUT' && target.tagName !== 'BUTTON') {
                        setDescTab('write');
                      }
                    }}
                  >
                    <MarkdownRenderer
                      content={descriptionValue}
                      onToggleTask={(newContent) => {
                        setDescriptionValue(newContent);
                        updateCardMutation.mutate({ description: newContent });
                      }}
                    />
                  </div>
                ) : (
                  <div
                    onClick={() => setDescTab('write')}
                    className="p-6 rounded-xl border border-dashed border-border/80 bg-muted/10 hover:bg-muted/20 hover:border-primary/50 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group text-center select-none"
                  >
                    <FileText className="w-6 h-6 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                    <div>
                      <p className="text-xs font-semibold text-foreground/80 group-hover:text-foreground">
                        No description provided
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Click here to add acceptance criteria, technical requirements, or notes...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Checklists & Progress Bar */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-primary" /> Checklists
              </Label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setShowNewChecklist(!showNewChecklist)}
              >
                <Plus className="w-3.5 h-3.5" /> Add Checklist
              </Button>
            </div>

            {showNewChecklist && (
              <div className="flex items-center gap-2 p-3 bg-muted/30 border border-border rounded-xl">
                <Input
                  placeholder="Checklist title (e.g. Acceptance Criteria)..."
                  className="h-8 text-sm"
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newChecklistTitle.trim()) {
                      addChecklistMutation.mutate(newChecklistTitle.trim());
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    if (newChecklistTitle.trim()) {
                      addChecklistMutation.mutate(newChecklistTitle.trim());
                    }
                  }}
                >
                  Create
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setShowNewChecklist(false)}
                >
                  Cancel
                </Button>
              </div>
            )}

            {checklists?.map((cl: any) => {
              const totalItems = cl.items?.length || 0;
              const doneItems = cl.items?.filter((i: any) => i.isDone).length || 0;
              const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

              return (
                <div
                  key={cl.id}
                  className="p-4 rounded-xl border border-border bg-card/60 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-foreground">{cl.title}</span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {doneItems}/{totalItems} ({pct}%)
                    </span>
                  </div>

                  {/* Animated Progress Bar */}
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        pct === 100 ? 'bg-emerald-500' : 'bg-primary'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Checklist items list */}
                  <div className="space-y-1.5 mt-3">
                    {cl.items?.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between group py-1 px-2 rounded-lg hover:bg-muted/40 transition-colors"
                      >
                        <label className="flex items-center gap-2.5 cursor-pointer text-sm flex-1">
                          <input
                            type="checkbox"
                            checked={item.isDone}
                            onChange={(e) =>
                              toggleItemMutation.mutate({
                                itemId: item.id,
                                isDone: e.target.checked,
                              })
                            }
                            className="w-4 h-4 rounded border-border text-primary cursor-pointer accent-primary"
                          />
                          <span
                            className={
                              item.isDone ? 'line-through text-muted-foreground' : 'text-foreground'
                            }
                          >
                            {item.text}
                          </span>
                        </label>
                      </div>
                    ))}

                    {/* Inline Add Item Input */}
                    <div className="pt-2">
                      <Input
                        placeholder="Add an item and press Enter..."
                        className="h-8 text-sm bg-muted/20 border-dashed"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            addItemMutation.mutate({
                              checklistId: cl.id,
                              text: e.currentTarget.value.trim(),
                            });
                            e.currentTarget.value = '';
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 3. Subtasks Hierarchy & Personal Work Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" /> Subtasks
                </Label>
                {subtasks && subtasks.length > 0 && (
                  <span className="text-xs text-muted-foreground font-medium">
                    ({subtasks.length})
                  </span>
                )}
              </div>

              {/* Subtask Filter: All vs My Subtasks */}
              {subtasks && subtasks.length > 0 && (
                <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border border-border">
                  <button
                    type="button"
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                      subtaskFilter === 'all'
                        ? 'bg-background text-foreground shadow-2xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setSubtaskFilter('all')}
                  >
                    All ({subtasks.length})
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                      subtaskFilter === 'mine'
                        ? 'bg-background text-foreground shadow-2xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setSubtaskFilter('mine')}
                  >
                    My Subtasks ({mySubtasksCount})
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {filteredSubtasks.map((subtask: any) => {
                const subAssignee = subtask.assignee || subtask.assignees?.[0];
                const isMine = subAssignee?.id === user?.id;

                return (
                  <div
                    key={subtask.id}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-card/60 hover:bg-muted/40 cursor-pointer transition-all group"
                    onClick={() =>
                      onSelectCard ? onSelectCard(subtask.id) : navigate(`/cards/${subtask.id}`)
                    }
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {subtask.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                      {/* Subtask Assignee Pill */}
                      {subAssignee ? (
                        <div
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                            isMine
                              ? 'bg-primary/15 text-primary border-primary/30'
                              : 'bg-muted/60 text-muted-foreground border-border'
                          }`}
                          title={`Assigned to: ${subAssignee.name || subAssignee.email}`}
                        >
                          {subAssignee.avatarUrl ? (
                            <img
                              src={subAssignee.avatarUrl}
                              alt={subAssignee.name}
                              className="w-3.5 h-3.5 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">
                              {subAssignee.name ? subAssignee.name.substring(0, 1).toUpperCase() : 'U'}
                            </div>
                          )}
                          <span className="truncate max-w-[90px]">
                            {isMine ? 'Me' : subAssignee.name || subAssignee.email}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/60 italic">Unassigned</span>
                      )}

                      {subtask.storyPoints && (
                        <span className="px-1.5 py-0.5 rounded bg-muted font-medium text-[10px]">
                          {subtask.storyPoints} pts
                        </span>
                      )}
                      <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                );
              })}

              {subtaskFilter === 'mine' && filteredSubtasks.length === 0 && (
                <p className="text-xs text-muted-foreground italic p-3 text-center bg-muted/20 rounded-xl border border-dashed border-border">
                  You have no subtasks assigned to you under this ticket.
                </p>
              )}

              {/* Add Subtask Form with Assignee Selector */}
              <div className="p-3 bg-muted/25 rounded-xl border border-border/80 space-y-2">
                <div className="flex gap-2">
                  <Input
                    id="new-subtask-input"
                    placeholder="Add a new subtask..."
                    className="h-8 text-xs bg-background"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newSubtaskTitle.trim()) {
                        addSubtaskMutation.mutate({
                          title: newSubtaskTitle.trim(),
                          assigneeId: newSubtaskAssigneeId || undefined,
                        });
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    disabled={!newSubtaskTitle.trim()}
                    onClick={() =>
                      addSubtaskMutation.mutate({
                        title: newSubtaskTitle.trim(),
                        assigneeId: newSubtaskAssigneeId || undefined,
                      })
                    }
                  >
                    Add Subtask
                  </Button>
                </div>

                {/* Subtask Assignee Quick Selection */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground font-medium">Assignee:</span>
                    <select
                      className="h-6 text-[11px] rounded-md bg-background border border-input px-2 text-foreground outline-none font-medium"
                      value={newSubtaskAssigneeId}
                      onChange={(e) => setNewSubtaskAssigneeId(e.target.value)}
                    >
                      {card.assignee && (
                        <option value={card.assignee.id}>
                          Primary Assignee: {card.assignee.name || card.assignee.email}
                        </option>
                      )}
                      {user && user.id !== card.assignee?.id && (
                        <option value={user.id}>
                          Assign to Me ({user.name || user.email})
                        </option>
                      )}
                      {card.participants?.map((p: any) =>
                        p.id !== user?.id && p.id !== card.assignee?.id ? (
                          <option key={p.id} value={p.id}>
                            Participant: {p.name || p.email}
                          </option>
                        ) : null
                      )}
                      {card.watchers?.map((w: any) =>
                        w.id !== user?.id &&
                        w.id !== card.assignee?.id &&
                        !participantUserIds.has(w.id) ? (
                          <option key={w.id} value={w.id}>
                            Observer: {w.name || w.email}
                          </option>
                        ) : null
                      )}
                      <option value="">Unassigned</option>
                    </select>
                  </div>

                  {user && newSubtaskAssigneeId !== user.id && (
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline cursor-pointer font-medium"
                      onClick={() => setNewSubtaskAssigneeId(user.id)}
                    >
                      Assign to Me
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 4. Time Tracking & Worklogs */}
          <div className="p-5 rounded-2xl border border-border bg-card/60 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> Time Tracking & Worklogs
              </Label>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => setIsLoggingTime(!isLoggingTime)}
              >
                <Plus className="w-3.5 h-3.5" /> Log Time
              </Button>
            </div>

            {/* Visual Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span>
                  Logged:{' '}
                  <strong className="text-foreground">
                    {(totalLoggedMinutes / 60).toFixed(1)}h
                  </strong>{' '}
                  {timeTrackingData?.billableMinutes ? (
                    <span className="text-emerald-500 font-medium">
                      ({(timeTrackingData.billableMinutes / 60).toFixed(1)}h billable)
                    </span>
                  ) : null}
                </span>
                <span>
                  Estimate:{' '}
                  <strong className="text-foreground">
                    {estimateMinutes ? `${(estimateMinutes / 60).toFixed(1)}h` : 'None'}
                  </strong>
                </span>
              </div>

              {estimateMinutes > 0 && (
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      totalLoggedMinutes > estimateMinutes ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${timeProgressPercent}%` }}
                  />
                </div>
              )}
            </div>

            {/* Inline Log Time Form */}
            {isLoggingTime && (
              <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Hours</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      className="h-8 text-sm"
                      value={logHours}
                      onChange={(e) => setLogHours(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Minutes</Label>
                    <Input
                      type="number"
                      min="0"
                      step="15"
                      placeholder="30"
                      className="h-8 text-sm"
                      value={logMinutes}
                      onChange={(e) => setLogMinutes(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Date</Label>
                  <Input
                    type="date"
                    className="h-8 text-sm"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Work Note</Label>
                  <Input
                    placeholder="Describe what was completed..."
                    className="h-8 text-sm"
                    value={logDescription}
                    onChange={(e) => setLogDescription(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={logIsBillable}
                      onChange={(e) => setLogIsBillable(e.target.checked)}
                      className="rounded accent-primary cursor-pointer"
                    />
                    Billable client work
                  </label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setIsLoggingTime(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => logTimeMutation.mutate()}
                      disabled={logTimeMutation.isPending}
                    >
                      Save Worklog
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Time Logs History */}
            {timeTrackingData?.timeLogs && timeTrackingData.timeLogs.length > 0 ? (
              <div className="space-y-1.5 mt-3">
                {timeTrackingData.timeLogs.map((log: any) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-muted/20 border border-border/70 group hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                        {log.user?.name?.substring(0, 2).toUpperCase() || 'U'}
                      </div>
                      <div>
                        <span className="font-semibold text-foreground">
                          {(log.minutes / 60).toFixed(1)} hrs
                        </span>
                        {log.isBillable && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            Billable
                          </span>
                        )}
                        <span className="ml-2 text-muted-foreground">
                          {log.description || 'Logged work'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{log.loggedDate}</span>
                      <button
                        className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity p-1 cursor-pointer"
                        onClick={() => deleteTimeLogMutation.mutate(log.id)}
                        title="Delete log entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No time logs recorded on this task yet.
              </p>
            )}
          </div>

          {/* 5. Attachments Gallery */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-primary" /> Attachments (
                {attachments?.length || 0})
              </Label>
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-xs font-medium hover:bg-muted/60 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Upload File
                </span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadAttachmentMutation.mutate(file);
                  }}
                />
              </label>
            </div>

            {attachments && attachments.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {attachments.map((att: any) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-card/60 hover:bg-muted/40 transition-colors group"
                  >
                    {att.fileType?.startsWith('image/') ? (
                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        <img
                          src={att.url}
                          alt={att.fileName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-muted/80 flex items-center justify-center font-bold text-xs uppercase text-muted-foreground flex-shrink-0">
                        {att.fileName.split('.').pop() || 'FILE'}
                      </div>
                    )}
                    <div className="flex-1 overflow-hidden">
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-xs truncate hover:underline block text-foreground"
                      >
                        {att.fileName}
                      </a>
                      <span className="text-[11px] text-muted-foreground block mt-0.5">
                        {att.sizeBytes ? `${(att.sizeBytes / 1024).toFixed(0)} KB • ` : ''}
                        {format(new Date(att.createdAt), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity p-1.5 cursor-pointer text-muted-foreground"
                      onClick={() => deleteAttachmentMutation.mutate(att.id)}
                      title="Delete attachment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 border border-dashed border-border rounded-xl text-center">
                <Paperclip className="w-6 h-6 text-muted-foreground/60 mx-auto mb-1.5" />
                <p className="text-xs text-muted-foreground">
                  Drag & drop files or click Upload File.
                </p>
              </div>
            )}
          </div>

          {/* 6. Activity & Rich Comments */}
          <div className="space-y-4">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" /> Discussion & Activity
            </Label>

            {/* New Comment Input Box with Mention Autocomplete */}
            <div className="flex gap-3 mt-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-1">
                {user?.name?.substring(0, 2).toUpperCase() || 'ME'}
              </div>
              <div className="flex-1">
                <MentionCommentBox
                  onSubmit={async (body, mentionedUserIds) => {
                    await addCommentMutation.mutateAsync({ body, mentionedUserIds });
                  }}
                  isSubmitting={addCommentMutation.isPending}
                />
              </div>
            </div>

            {/* Comments Stream */}
            <div className="space-y-3 mt-4">
              {comments?.map((c: any) => (
                <div
                  key={c.id}
                  className="flex gap-3 p-3.5 rounded-xl bg-muted/15 border border-border/60"
                >
                  {c.authorAvatarUrl ? (
                    <img
                      src={c.authorAvatarUrl}
                      alt={c.authorName || 'Avatar'}
                      className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-border"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {c.authorName
                        ? c.authorName.substring(0, 2).toUpperCase()
                        : c.userId?.substring(0, 2).toUpperCase() || 'U'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-xs text-foreground">
                        {c.authorName || c.authorEmail || 'Team Member'}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="text-xs text-foreground/90">
                      <MarkdownRenderer content={c.body} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── RIGHT COLUMN: Metadata & Sidebar Controls (Scrollable) ─── */}
        <div className="w-full lg:w-80 xl:w-84 shrink-0 border-t lg:border-t-0 lg:border-l border-border/70 bg-muted/15 overflow-y-auto p-5 space-y-5">
          {/* Stage / Status */}
          <div className="p-4 rounded-2xl border border-border bg-card/60 space-y-3">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
              Stage / Status
            </Label>
            {stageTemplates && stageTemplates.length > 0 && stageTemplates[0].stages ? (
              <SearchableSelect
                options={[
                  { value: '', label: 'No Stage Assigned' },
                  ...stageTemplates[0].stages.map((stg: any) => ({
                    value: stg.id,
                    label: stg.name,
                    sublabel: stg.category,
                    badge: stg.color ? (
                      <span
                        className="px-1.5 py-0.2 rounded text-[10px] font-semibold border"
                        style={{
                          backgroundColor: `${stg.color}20`,
                          color: stg.color,
                          borderColor: `${stg.color}35`,
                        }}
                      >
                        {stg.category}
                      </span>
                    ) : undefined,
                  })),
                ]}
                value={card.stageId || ''}
                onChange={(val) => updateCardMutation.mutate({ stageId: val || null })}
                placeholder="Select Stage..."
                size="sm"
                triggerClassName="h-8 bg-background text-xs"
              />
            ) : (
              <p className="text-xs text-muted-foreground">No stage templates defined.</p>
            )}
          </div>

          {/* 1. Primary Assignee Card (Single Owner Model) */}
          <div className="p-4 rounded-2xl border border-border bg-card/60 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-primary" /> Primary Assignee
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-1.5 text-primary gap-1"
                onClick={() => setShowAssigneePicker(!showAssigneePicker)}
              >
                <UserPlus className="w-3.5 h-3.5" /> {card.assignee ? 'Change' : 'Assign'}
              </Button>
            </div>

            {/* Single Member Chip */}
            <div>
              {card.assignee ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-xs font-medium text-foreground">
                  {card.assignee.avatarUrl ? (
                    <img
                      src={card.assignee.avatarUrl}
                      alt={card.assignee.name || card.assignee.email}
                      className="w-5 h-5 rounded-full object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">
                      {card.assignee.name
                        ? card.assignee.name.substring(0, 2).toUpperCase()
                        : 'U'}
                    </div>
                  )}
                  <span className="truncate max-w-[130px] font-semibold">
                    {card.assignee.name || card.assignee.email}
                  </span>
                  <button
                    type="button"
                    className="hover:text-destructive ml-1 cursor-pointer text-muted-foreground transition-colors"
                    onClick={() => removeUserMutation.mutate(card.assignee.id)}
                    title="Unassign owner"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No primary assignee</p>
              )}
            </div>

            {/* Member picker popover for single assignee */}
            {showAssigneePicker && (
              <div className="relative">
                <MemberPicker
                  orgId={orgId}
                  assignedUserIds={assignedUserIds}
                  onAssign={(userId) => assignUserMutation.mutate(userId)}
                  onRemove={(userId) => removeUserMutation.mutate(userId)}
                  onClose={() => setShowAssigneePicker(false)}
                  currentUserId={user?.id}
                  title="Assign Primary Owner"
                  mode="single"
                />
              </div>
            )}
          </div>

          {/* 2. Participants Card (Multiple Collaborators Model) */}
          <div className="p-4 rounded-2xl border border-border bg-card/60 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-sky-500" /> Participants
                {card.participants && card.participants.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground font-semibold">
                    {card.participants.length}
                  </span>
                )}
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-1.5 text-sky-500 gap-1"
                onClick={() => setShowParticipantPicker(!showParticipantPicker)}
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>

            {/* Participants list chips */}
            <div className="flex flex-wrap gap-1.5">
              {card.participants && card.participants.length > 0 ? (
                card.participants.map((p: any) => (
                  <div
                    key={p.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-xs font-medium text-foreground"
                  >
                    {p.avatarUrl ? (
                      <img
                        src={p.avatarUrl}
                        alt={p.name || p.email}
                        className="w-4 h-4 rounded-full object-cover ring-1 ring-border"
                      />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-sky-500/30 flex items-center justify-center text-[9px] font-bold text-sky-600 dark:text-sky-400">
                        {p.name ? p.name.substring(0, 2).toUpperCase() : 'U'}
                      </div>
                    )}
                    <span className="truncate max-w-[110px]">{p.name || p.email}</span>
                    <button
                      type="button"
                      className="hover:text-destructive ml-0.5 cursor-pointer text-muted-foreground"
                      onClick={() => removeParticipantMutation.mutate(p.id)}
                      title="Remove participant"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground italic">No participants yet</p>
              )}
            </div>

            {/* Member picker popover for participants */}
            {showParticipantPicker && (
              <div className="relative">
                <MemberPicker
                  orgId={orgId}
                  assignedUserIds={participantUserIds}
                  onAssign={(userId) => addParticipantMutation.mutate(userId)}
                  onRemove={(userId) => removeParticipantMutation.mutate(userId)}
                  onClose={() => setShowParticipantPicker(false)}
                  currentUserId={user?.id}
                  title="Add Participants"
                  mode="multiple"
                />
              </div>
            )}
          </div>

          {/* 3. Observers & Watchers Card (Multiple Observers Model) */}
          <div className="p-4 rounded-2xl border border-border bg-card/60 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-emerald-500" /> Observers
                {card.watchers && card.watchers.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground font-semibold">
                    {card.watchers.length}
                  </span>
                )}
              </Label>
              <div className="flex items-center gap-1">
                {user && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-6 text-[11px] px-1.5 gap-1 ${
                      isCurrentUserWatching
                        ? 'text-emerald-500 hover:text-emerald-600'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => {
                      if (isCurrentUserWatching) {
                        unwatchCardMutation.mutate(user.id);
                      } else {
                        watchCardMutation.mutate(user.id);
                      }
                    }}
                  >
                    {isCurrentUserWatching ? (
                      <>
                        <EyeOff className="w-3 h-3" /> Unwatch
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" /> Watch
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-1.5 text-emerald-500 gap-1"
                  onClick={() => setShowWatcherPicker(!showWatcherPicker)}
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </Button>
              </div>
            </div>

            {/* Observers list chips */}
            <div className="flex flex-wrap gap-1.5">
              {card.watchers && card.watchers.length > 0 ? (
                card.watchers.map((w: any) => (
                  <div
                    key={w.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-foreground"
                  >
                    {w.avatarUrl ? (
                      <img
                        src={w.avatarUrl}
                        alt={w.name || w.email}
                        className="w-4 h-4 rounded-full object-cover ring-1 ring-border"
                      />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-emerald-500/30 flex items-center justify-center text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                        {w.name ? w.name.substring(0, 2).toUpperCase() : 'U'}
                      </div>
                    )}
                    <span className="truncate max-w-[110px]">{w.name || w.email}</span>
                    <button
                      type="button"
                      className="hover:text-destructive ml-0.5 cursor-pointer text-muted-foreground"
                      onClick={() => unwatchCardMutation.mutate(w.id)}
                      title="Remove observer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground italic">No observers yet</p>
              )}
            </div>

            {/* Member picker popover for watchers */}
            {showWatcherPicker && (
              <div className="relative">
                <MemberPicker
                  orgId={orgId}
                  assignedUserIds={watcherUserIds}
                  onAssign={(userId) => watchCardMutation.mutate(userId)}
                  onRemove={(userId) => unwatchCardMutation.mutate(userId)}
                  onClose={() => setShowWatcherPicker(false)}
                  currentUserId={user?.id}
                  title="Add Observers"
                  mode="multiple"
                />
              </div>
            )}
          </div>

          {/* Labels & Tags Card */}
          <div className="p-4 rounded-2xl border border-border bg-card/60 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Labels
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-1.5 text-primary gap-1"
                onClick={() => setShowLabelPicker(!showLabelPicker)}
              >
                <Plus className="w-3.5 h-3.5" /> Add Label
              </Button>
            </div>

            {/* Active labels */}
            <div className="flex flex-wrap gap-1.5">
              {card.labels && card.labels.length > 0 ? (
                card.labels.map((lbl: any) => (
                  <span
                    key={lbl.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold group/lbl transition-all shadow-2xs"
                    style={{
                      backgroundColor: `${lbl.color}18`,
                      color: lbl.color,
                      border: `1px solid ${lbl.color}35`,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: lbl.color }}
                    />
                    <span>{lbl.name}</span>
                    <button
                      type="button"
                      className="opacity-70 hover:opacity-100 hover:text-destructive transition-opacity ml-0.5 cursor-pointer"
                      onClick={() => toggleLabelMutation.mutate({ labelId: lbl.id, hasLabel: true })}
                      title="Remove label"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              ) : (
                <p className="text-xs text-muted-foreground italic">No labels attached</p>
              )}
            </div>

            {/* Label Picker Popover */}
            {showLabelPicker && (
              <div className="relative">
                <LabelPicker
                  boardId={card.boardId}
                  cardId={cardId}
                  cardLabelIds={cardLabelIds}
                  onClose={() => setShowLabelPicker(false)}
                />
              </div>
            )}
          </div>

          {/* Dates & Estimation */}
          <div className="p-4 rounded-2xl border border-border bg-card/60 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Due Date
                </Label>
                {card.dueDate && (
                  <button
                    type="button"
                    className="text-[11px] text-destructive hover:underline"
                    onClick={() => updateCardMutation.mutate({ dueDate: null })}
                  >
                    Clear
                  </button>
                )}
              </div>
              <Input
                type="date"
                className={`h-8 text-xs ${isDueOverdue ? 'border-destructive text-destructive' : ''}`}
                value={card.dueDate ? card.dueDate.split('T')[0] : ''}
                onChange={(e) =>
                  updateCardMutation.mutate({
                    dueDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
              />
              {isDueOverdue && (
                <span className="text-[11px] text-destructive font-semibold flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> Overdue
                </span>
              )}
            </div>

            {/* Points & Estimation Numbers */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
              <div>
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
                  Story Points
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Pts"
                  className="h-8 text-xs text-center font-medium"
                  defaultValue={card.storyPoints ?? ''}
                  onBlur={(e) => {
                    const val = e.target.value === '' ? null : Number(e.target.value);
                    if (val !== card.storyPoints) updateCardMutation.mutate({ storyPoints: val });
                  }}
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
                  Est (Hours)
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="Hrs"
                  className="h-8 text-xs text-center font-medium"
                  defaultValue={card.estimateMinutes ? (card.estimateMinutes / 60).toFixed(1) : ''}
                  onBlur={(e) => {
                    const hours = Number(e.target.value) || 0;
                    const mins = Math.round(hours * 60);
                    if (mins !== card.estimateMinutes) {
                      updateCardMutation.mutate({ estimateMinutes: mins || null });
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Sprints & Roadmap Phases */}
          {card.projectId && (
            <div className="p-4 rounded-2xl border border-border bg-card/60 space-y-3">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                Sprint & Roadmap Phase
              </Label>
              {sprints && sprints.length > 0 && (
                <div>
                  <Label className="text-[11px] text-muted-foreground mb-1 block">
                    Active Sprint
                  </Label>
                  <SearchableSelect
                    options={sprints.map((sp: any) => ({
                      value: sp.id,
                      label: sp.name,
                      badge: (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-muted text-muted-foreground">
                          {sp.status}
                        </span>
                      ),
                    }))}
                    value=""
                    onChange={(val) => {
                      if (val) sprintsService.addCardToSprint(val, cardId);
                    }}
                    placeholder="Assign to sprint..."
                    size="sm"
                    triggerClassName="h-8 bg-background text-xs"
                  />
                </div>
              )}

              {phases && phases.length > 0 && (
                <div>
                  <Label className="text-[11px] text-muted-foreground mb-1 block">
                    Project Phase
                  </Label>
                  <SearchableSelect
                    options={phases.map((ph: any) => ({
                      value: ph.id,
                      label: `${ph.name} (Phase ${ph.position})`,
                    }))}
                    value=""
                    onChange={(val) => {
                      if (val) phasesService.addCardToPhase(val, cardId);
                    }}
                    placeholder="Assign to phase..."
                    size="sm"
                    triggerClassName="h-8 bg-background text-xs"
                  />
                </div>
              )}
            </div>
          )}

          {/* Danger Zone: Archive / Delete */}
          <div className="p-4 rounded-2xl border border-destructive/20 bg-destructive/5 space-y-2">
            <Label className="text-xs font-bold text-destructive uppercase tracking-wider block">
              Card Actions
            </Label>
            <div className="flex flex-col gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs justify-start text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setShowArchiveConfirm(true)}
              >
                Archive Card
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="w-full text-xs justify-start gap-1.5 cursor-pointer"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Card
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── In-Modal Unsaved Changes Confirmation Dialog (Industry Standard) ─── */}
      {showUnsavedPrompt && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in-50 duration-150">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 border border-amber-500/20">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-foreground tracking-tight">Unsaved Changes</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    You have unsaved modifications in the task description. If you close this ticket without saving, your edits will be discarded.
                  </p>
                </div>
              </div>

              {descriptionValue && (
                <div className="p-3 rounded-xl bg-muted/40 border border-border/80 text-xs font-mono text-muted-foreground max-h-24 overflow-y-auto whitespace-pre-wrap">
                  {descriptionValue}
                </div>
              )}
            </div>

            <div className="p-4 bg-muted/30 border-t border-border flex flex-col sm:flex-row items-center justify-end gap-2 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full sm:w-auto text-xs cursor-pointer"
                onClick={() => {
                  setShowUnsavedPrompt(false);
                  setPendingAction(null);
                }}
              >
                Keep Editing
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 cursor-pointer"
                onClick={() => {
                  setDescriptionValue(card?.description || '');
                  setIsDescDirty(false);
                  onDirtyChange?.(false);
                  setDescTab('preview');
                  setShowUnsavedPrompt(false);
                  if (pendingAction) {
                    const action = pendingAction;
                    setPendingAction(null);
                    action();
                  } else {
                    onClose?.();
                  }
                }}
              >
                Discard Changes
              </Button>
              <Button
                type="button"
                size="sm"
                className="w-full sm:w-auto text-xs gap-1.5 cursor-pointer font-semibold"
                disabled={updateCardMutation.isPending}
                onClick={async () => {
                  await updateCardMutation.mutateAsync({ description: descriptionValue });
                  setIsDescDirty(false);
                  onDirtyChange?.(false);
                  setDescTab('preview');
                  setShowUnsavedPrompt(false);
                  if (pendingAction) {
                    const action = pendingAction;
                    setPendingAction(null);
                    action();
                  } else {
                    onClose?.();
                  }
                }}
              >
                <Save className="w-3.5 h-3.5" />
                {updateCardMutation.isPending ? 'Saving...' : 'Save & Close'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Share Task & Rich Links Modal ─── */}
      <ShareTaskModal
        card={card}
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
      />

      {/* ─── Archive Task Confirmation Dialog ─── */}
      <ConfirmDialog
        open={showArchiveConfirm}
        onOpenChange={setShowArchiveConfirm}
        title="Archive Task Card"
        description={`Are you sure you want to archive "${card?.title || 'this task card'}"? It can be retrieved or restored from the board archive at any time.`}
        confirmLabel="Archive Card"
        variant="warning"
        isLoading={archiveCardMutation.isPending}
        onConfirm={() => archiveCardMutation.mutate()}
      />

      {/* ─── Delete Task Confirmation Dialog ─── */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Permanently Delete Task Card"
        description={`Are you sure you want to permanently delete "${card?.title || 'this task card'}"? This action cannot be undone and will delete all attachments, comments, and logged time.`}
        confirmLabel="Delete Card"
        variant="destructive"
        isLoading={deleteCardMutation.isPending}
        onConfirm={() => deleteCardMutation.mutate()}
      />
    </div>
  );
});
