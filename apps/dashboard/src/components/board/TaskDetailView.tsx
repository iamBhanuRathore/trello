import {
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useRef,
  lazy,
  Suspense,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { stagesService } from '../../lib/stagesService';
import { sprintsService } from '../../lib/sprintsService';
import { phasesService } from '../../lib/phasesService';
import { logCardTime, getCardTimeLogs, deleteTimeLog } from '../../lib/api';
import { format, isPast } from 'date-fns';
import {
  Paperclip,
  CheckSquare,
  MessageSquare,
  Trash2,
  Clock,
  Plus,
  ListChecks,
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
  Layers,
  Eye,
  EyeOff,
  MoreHorizontal,
  Share2,
  CopyPlus,
  PlusCircle,
  GitBranch,
  Tag,
  Archive,
  Flame,
  Star,
  Hourglass,
  Calendar,
  FolderGit2,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Play,
  CheckCircle2,
  Pause,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { DatePicker } from '@boardly/ui';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@boardly/ui/dropdown-menu';
import { MemberPicker } from './MemberPicker';
import { LabelPicker } from './LabelPicker';
import { TaskChatPane } from './TaskChatPane';
import { RouteFallback } from '../common/RouteFallback';
// Full subtask composer (code-split: loads only when opened).
const CreateTaskModal = lazy(() =>
  import('./CreateTaskModal').then((m) => ({ default: m.CreateTaskModal }))
);
import { TaskActionRibbon } from './TaskActionRibbon';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { SearchableSelect, ListSearchableSelect } from '../ui/SearchableSelect';
import { ShareTaskModal } from './ShareTaskModal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Kbd } from '../ui/Kbd';
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

    // Active view tab for mobile responsiveness (Details vs Task Chat)
    const [mobileActiveTab, setMobileActiveTab] = useState<'details' | 'chat'>('details');

    // Local UI States
    const [descTab, setDescTab] = useState<'write' | 'preview'>('preview');
    const [isDescExpanded, setIsDescExpanded] = useState<boolean>(true);
    const [descriptionValue, setDescriptionValue] = useState<string>('');
    const [isDescDirty, setIsDescDirty] = useState<boolean>(false);
    const [showUnsavedPrompt, setShowUnsavedPrompt] = useState<boolean>(false);
    const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

    // Pickers & Popovers (Floating)
    const [showAssigneePicker, setShowAssigneePicker] = useState<boolean>(false);
    const [showParticipantPicker, setShowParticipantPicker] = useState<boolean>(false);
    const [showWatcherPicker, setShowWatcherPicker] = useState<boolean>(false);
    const [showLabelPicker, setShowLabelPicker] = useState<boolean>(false);
    const [showNewChecklist, setShowNewChecklist] = useState<boolean>(false);
    const [newChecklistTitle, setNewChecklistTitle] = useState<string>('');
    const [collapsedChecklistIds, setCollapsedChecklistIds] = useState<Set<string>>(new Set());
    const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
    const [editingChecklistTitle, setEditingChecklistTitle] = useState<string>('');
    const [addingItemChecklistId, setAddingItemChecklistId] = useState<string | null>(null);
    const [addingItemText, setAddingItemText] = useState<string>('');
    const [showSubtaskComposer, setShowSubtaskComposer] = useState<boolean>(false);
    const [subtaskFilter, setSubtaskFilter] = useState<'all' | 'mine'>('all');

    // Popover refs for click outside
    const assigneePickerRef = useRef<HTMLDivElement>(null);
    const participantPickerRef = useRef<HTMLDivElement>(null);
    const watcherPickerRef = useRef<HTMLDivElement>(null);
    const labelPickerRef = useRef<HTMLDivElement>(null);

    // Time logging & Task Timer
    const [isLoggingTime, setIsLoggingTime] = useState<boolean>(false);
    const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
    const [timerSeconds, setTimerSeconds] = useState<number>(0);
    const [logHours, setLogHours] = useState<string>('');
    const [logMinutes, setLogMinutes] = useState<string>('');
    const [logDescription, setLogDescription] = useState<string>('');
    const [logIsBillable, setLogIsBillable] = useState<boolean>(true);
    const [logDate, setLogDate] = useState<string>(new Date().toISOString().split('T')[0]);

    // Rate task modal / rating state
    const [userRating, setUserRating] = useState<number>(() => {
      const saved = localStorage.getItem(`task-rating-${cardId}`);
      return saved ? Number(saved) : 0;
    });
    const [showRateModal, setShowRateModal] = useState<boolean>(false);

    // Dialogs & Modals
    const [copiedLink, setCopiedLink] = useState<boolean>(false);
    const [showShareModal, setShowShareModal] = useState<boolean>(false);
    const [copiedId, setCopiedId] = useState<boolean>(false);
    const [copiedBranch, setCopiedBranch] = useState<boolean>(false);
    const [showArchiveConfirm, setShowArchiveConfirm] = useState<boolean>(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
    const [confirmDeleteChecklist, setConfirmDeleteChecklist] = useState<{
      id: string;
      title: string;
      itemCount: number;
    } | null>(null);

    // Active Timer effect
    useEffect(() => {
      let interval: any = null;
      if (isTimerRunning) {
        interval = setInterval(() => {
          setTimerSeconds((prev) => prev + 1);
        }, 1000);
      }
      return () => {
        if (interval) clearInterval(interval);
      };
    }, [isTimerRunning]);

    // Click outside listener for pickers
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (
          showAssigneePicker &&
          assigneePickerRef.current &&
          !assigneePickerRef.current.contains(target)
        ) {
          setShowAssigneePicker(false);
        }
        if (
          showParticipantPicker &&
          participantPickerRef.current &&
          !participantPickerRef.current.contains(target)
        ) {
          setShowParticipantPicker(false);
        }
        if (
          showWatcherPicker &&
          watcherPickerRef.current &&
          !watcherPickerRef.current.contains(target)
        ) {
          setShowWatcherPicker(false);
        }
        if (showLabelPicker && labelPickerRef.current && !labelPickerRef.current.contains(target)) {
          setShowLabelPicker(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showAssigneePicker, showParticipantPicker, showWatcherPicker, showLabelPicker]);

    // Queries
    const { data: card, isLoading: isCardLoading } = useQuery({
      queryKey: ['card', cardId],
      queryFn: async () => {
        const res = await api.get(`/cards/${cardId}`);
        return res.data;
      },
      enabled: !!cardId,
    });

    // Sync description editor value from card data.
    // This runs both when fresh data arrives from the network AND when TanStack
    // Query serves the result from cache, fixing the stale-description bug where
    // opening a task showed "No requirement provided" until a hard refresh.
    useEffect(() => {
      if (!isDescDirty) {
        setDescriptionValue(card?.description || '');
      }
    }, [card?.description, isDescDirty]);

    const taskIdentifier = getTaskIdentifier(card);

    // Dynamic OpenGraph metadata & title
    usePageMetadata({
      title: card
        ? `${taskIdentifier}: ${card.title} · ${card.boardName || 'Boardly'}`
        : 'Task Details · Boardly',
      description: card?.description
        ? `${card.description.slice(0, 200)} [Status: ${card.listName || 'In Progress'}]`
        : `View task ${taskIdentifier} on Boardly enterprise workspace.`,
      url: typeof window !== 'undefined' ? `${window.location.origin}/cards/${cardId}` : undefined,
    });

    const { data: lists = [] } = useQuery({
      queryKey: ['lists', card?.boardId],
      queryFn: async () => (await api.get(`/lists?boardId=${card?.boardId}`)).data,
      enabled: !!card?.boardId,
    });

    const { data: comments = [] } = useQuery({
      queryKey: ['card', cardId, 'comments'],
      queryFn: async () => (await api.get(`/cards/${cardId}/comments`)).data,
      enabled: !!cardId,
    });

    const { data: checklists = [] } = useQuery({
      queryKey: ['card', cardId, 'checklists'],
      queryFn: async () => (await api.get(`/cards/${cardId}/checklists`)).data,
      enabled: !!cardId,
    });

    const { data: attachments = [] } = useQuery({
      queryKey: ['card', cardId, 'attachments'],
      queryFn: async () => (await api.get(`/cards/${cardId}/attachments`)).data,
      enabled: !!cardId,
    });

    const { data: subtasks = [] } = useQuery({
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
        try {
          const ts = await stagesService.getTemplates(orgId!);
          if (ts && ts.length > 0) {
            const fullTemplate = await stagesService.getTemplate(ts[0].id);
            ts[0].stages = fullTemplate?.stages || [];
          }
          return ts || [];
        } catch {
          return [];
        }
      },
      enabled: !!orgId,
      retry: false,
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
      onError: (err: any) => {
        toast.error(getApiErrorMessage(err, 'Failed to move task. Please try again.'));
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
      mutationFn: async (userId: string) =>
        await api.post(`/cards/${cardId}/assignees`, { userId }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
        setShowAssigneePicker(false);
      },
    });

    const removeUserMutation = useMutation({
      mutationFn: async (userId: string) =>
        await api.delete(`/cards/${cardId}/assignees/${userId}`),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      },
    });

    const addParticipantMutation = useMutation({
      mutationFn: async (userId: string) =>
        await api.post(`/cards/${cardId}/participants`, { userId }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      },
    });

    const removeParticipantMutation = useMutation({
      mutationFn: async (userId: string) =>
        await api.delete(`/cards/${cardId}/participants/${userId}`),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      },
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

    const editCommentMutation = useMutation({
      mutationFn: async ({ commentId, body }: { commentId: string; body: string }) =>
        await api.patch(`/cards/comments/${commentId}`, { body }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'comments'] });
      },
      onError: (err: any) => {
        toast.error(err?.response?.data?.message || err?.message || 'Failed to update comment');
      },
    });

    const deleteCommentMutation = useMutation({
      mutationFn: async (commentId: string) => await api.delete(`/cards/comments/${commentId}`),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'comments'] });
      },
      onError: (err: any) => {
        toast.error(err?.response?.data?.message || err?.message || 'Failed to delete comment');
      },
    });

    const addChecklistMutation = useMutation({
      mutationFn: async ({ title, items }: { title: string; items?: string[] }) =>
        await api.post(`/cards/${cardId}/checklists`, { title, position: 0, items }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'checklists'] });
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'comments'] });
        setNewChecklistTitle('');
        setShowNewChecklist(false);
      },
      onError: (err: any) => {
        toast.error(getApiErrorMessage(err, 'Failed to add checklist'));
      },
    });

    const updateChecklistMutation = useMutation({
      mutationFn: async ({ checklistId, title }: { checklistId: string; title: string }) =>
        await api.patch(`/cards/checklists/${checklistId}`, { title }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'checklists'] });
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'comments'] });
        setEditingChecklistId(null);
      },
      onError: (err: any) => {
        toast.error(getApiErrorMessage(err, 'Failed to update checklist'));
      },
    });

    const deleteChecklistMutation = useMutation({
      mutationFn: async (checklistId: string) =>
        await api.delete(`/cards/checklists/${checklistId}`),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'checklists'] });
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'comments'] });
      },
      onError: (err: any) => {
        toast.error(getApiErrorMessage(err, 'Failed to delete checklist'));
      },
    });

    const toggleChecklistCollapse = (checklistId: string) => {
      setCollapsedChecklistIds((prev) => {
        const next = new Set(prev);
        if (next.has(checklistId)) next.delete(checklistId);
        else next.add(checklistId);
        return next;
      });
    };

    const addItemMutation = useMutation({
      mutationFn: async ({ checklistId, text }: { checklistId: string; text: string }) =>
        await api.post(`/cards/checklists/${checklistId}/items`, { text, position: 0 }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'checklists'] });
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'comments'] });
      },
      onError: (err: any) => {
        toast.error(getApiErrorMessage(err, 'Failed to add checklist item'));
      },
    });

    const addBulkItemsMutation = useMutation({
      mutationFn: async ({ checklistId, items }: { checklistId: string; items: string[] }) =>
        await api.post(`/cards/checklists/${checklistId}/bulk-items`, { items }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'checklists'] });
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'comments'] });
      },
      onError: (err: any) => {
        toast.error(getApiErrorMessage(err, 'Failed to add checklist items'));
      },
    });

    const toggleItemMutation = useMutation({
      mutationFn: async ({ itemId, isDone }: { itemId: string; isDone: boolean }) => {
        const res = await api.patch(`/cards/checklist-items/${itemId}`, { isDone });
        return res.data;
      },
      onMutate: async ({ itemId, isDone }) => {
        await queryClient.cancelQueries({ queryKey: ['card', cardId, 'checklists'] });
        const previous = queryClient.getQueryData(['card', cardId, 'checklists']);
        queryClient.setQueryData(['card', cardId, 'checklists'], (old: any[]) => {
          if (!old) return [];
          return old.map((cl) => ({
            ...cl,
            items: cl.items?.map((it: any) => (it.id === itemId ? { ...it, isDone } : it)),
          }));
        });
        return { previous };
      },
      onError: (err: any, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(['card', cardId, 'checklists'], context.previous);
        }
        toast.error(getApiErrorMessage(err, 'Failed to update checklist item'));
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'checklists'] });
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'comments'] });
      },
    });

    const deleteChecklistItemMutation = useMutation({
      mutationFn: async (itemId: string) => await api.delete(`/cards/checklist-items/${itemId}`),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'checklists'] });
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'comments'] });
      },
      onError: (err: any) => {
        toast.error(getApiErrorMessage(err, 'Failed to delete checklist item'));
      },
    });

    const handleSaveItemOrBulk = async (checklistId: string, items: string[]) => {
      const cleanItems = items.map((t) => t.trim()).filter(Boolean);
      if (cleanItems.length === 0) return;

      if (cleanItems.length > 1) {
        await addBulkItemsMutation.mutateAsync({ checklistId, items: cleanItems });
      } else if (cleanItems.length === 1) {
        await addItemMutation.mutateAsync({ checklistId, text: cleanItems[0] });
      }
      setAddingItemChecklistId(null);
      setAddingItemText('');
    };

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
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'attachments'] });
      },
    });

    const deleteAttachmentMutation = useMutation({
      mutationFn: async (attachmentId: string) =>
        await api.delete(`/cards/${cardId}/attachments/${attachmentId}`),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card', cardId, 'attachments'] }),
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
        toast.success('Time worklog recorded');
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
        toast.success('Task cloned successfully');
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

    // Subtask creation always goes through the full composer popup.
    const handleCreateSubtask = () => {
      setShowSubtaskComposer(true);
    };

    // ─── START & COMPLETE ACTIONS ───
    const handleStartTask = async () => {
      // Find in-progress or doing list
      const inProgressList = lists.find(
        (l: any) => /progress|doing|dev|active/i.test(l.name) && l.id !== card?.listId
      );
      if (inProgressList) {
        await moveCardMutation.mutateAsync(inProgressList.id);
      }
      setIsTimerRunning(!isTimerRunning);
      if (!isTimerRunning) {
        toast.success('Task started! Tracking working time.');
      } else {
        // Log accumulated time if paused
        const mins = Math.max(1, Math.round(timerSeconds / 60));
        await logCardTime(cardId, {
          minutes: mins,
          description: 'Live task timer session',
          loggedDate: new Date().toISOString().split('T')[0],
          isBillable: true,
        });
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'time-logs'] });
        setTimerSeconds(0);
        toast.info(`Task paused. Logged ${mins} minutes.`);
      }
    };

    const handleCompleteTask = async () => {
      // Find Done or Completed list
      const doneList =
        lists.find((l: any) => /done|complete|finished|closed/i.test(l.name)) ||
        lists[lists.length - 1];

      if (doneList && doneList.id !== card?.listId) {
        await moveCardMutation.mutateAsync(doneList.id);
      }

      // Mark all checklist items as done
      checklists.forEach((cl: any) => {
        cl.items?.forEach((it: any) => {
          if (!it.isDone) {
            toggleItemMutation.mutate({ itemId: it.id, isDone: true });
          }
        });
      });

      if (isTimerRunning) {
        setIsTimerRunning(false);
        const mins = Math.max(1, Math.round(timerSeconds / 60));
        await logCardTime(cardId, {
          minutes: mins,
          description: 'Completion work session',
          loggedDate: new Date().toISOString().split('T')[0],
          isBillable: true,
        });
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'time-logs'] });
        setTimerSeconds(0);
      }

      toast.success('Task marked as Complete!');
    };

    // Description helpers
    const handleSaveDescription = async () => {
      if (descriptionValue !== (card?.description || '')) {
        await updateCardMutation.mutateAsync({ description: descriptionValue });
      }
      setIsDescDirty(false);
      onDirtyChange?.(false);
      setDescTab('preview');
    };

    const handleDiscardDescription = () => {
      setDescriptionValue(card?.description || '');
      setIsDescDirty(false);
      onDirtyChange?.(false);
      setDescTab('preview');
    };

    // Intercept navigation or closing if dirty
    const handleAttemptAction = useCallback(
      (action: () => void) => {
        if (isDescDirty) {
          setPendingAction(() => action);
          setShowUnsavedPrompt(true);
        } else {
          action();
        }
      },
      [isDescDirty]
    );

    const handleAttemptClose = useCallback(() => {
      handleAttemptAction(() => onClose?.());
    }, [handleAttemptAction, onClose]);

    // ESC key closes the dialog (modal mode only)
    useEffect(() => {
      if (mode !== 'modal') return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') handleAttemptClose();
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [mode, handleAttemptClose]);

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
      toast.success('Task link copied to clipboard');
    };

    // Jump to section helper via Action Ribbon
    const handleScrollToSection = (sectionId: string) => {
      const el = document.getElementById(`section-${sectionId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    if (isCardLoading) {
      return (
        <div className="flex items-center justify-center p-20 min-h-[400px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground font-medium">
              Loading enterprise task view...
            </p>
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
      card?.assignee?.id ? [card.assignee.id] : card?.assignees?.map((a: any) => a.id) || []
    );
    const participantUserIds = new Set<string>(card?.participants?.map((p: any) => p.id) || []);
    const watcherUserIds = new Set<string>(card?.watchers?.map((w: any) => w.id) || []);
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

    const totalLoggedMinutes = timeTrackingData?.totalMinutes || 0;
    const estimateMinutes = card.estimateMinutes || 0;
    const timeProgressPercent =
      estimateMinutes > 0
        ? Math.min(100, Math.round((totalLoggedMinutes / estimateMinutes) * 100))
        : 0;

    const isDueOverdue = card.dueDate && isPast(new Date(card.dueDate));

    // Compute Total Unique Members in Task Chat
    const uniqueMemberCount = new Set([
      ...(card.assignee?.id ? [card.assignee.id] : []),
      ...(card.creatorId ? [card.creatorId] : []),
      ...Array.from(participantUserIds),
      ...Array.from(watcherUserIds),
      ...(user?.id ? [user.id] : []),
    ]).size;

    // System timeline events (derived from card state changes).
    // NOTE: watcher entries are NOT synthesized here — watch/unwatch are
    // persistent history comments written by the backend, so deriving them
    // from the current watchers list would duplicate entries (and could never
    // show "stopped watching" after the row is deleted).
    const systemActivities = [
      {
        id: 'created',
        text: `Task created in ${card.boardName || 'board'}`,
        createdAt: card.createdAt || new Date().toISOString(),
      },
      ...(card.stageId
        ? [
            {
              id: 'stage-change',
              text: `Stage set to "${card.stageName || 'In Progress'}"`,
              createdAt: card.updatedAt || new Date().toISOString(),
            },
          ]
        : []),
    ];

    // Format timer seconds into mm:ss
    const formatTimer = (totalSeconds: number) => {
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
      <div className="relative flex flex-col w-full h-full bg-background text-foreground overflow-hidden">
        {/* ─── Top Navigation Header Bar (Breadcrumb, Task ID Pill, Actions) ─── */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 border-b border-border/70 shrink-0 bg-card/95 backdrop-blur-md z-20">
          {/* Left: Breadcrumbs / Path & Identifier */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-hidden flex-wrap">
            {mode === 'page' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs font-semibold gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => (card.boardId ? navigate(`/b/${card.boardId}`) : navigate(-1))}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </Button>
            )}

            {card.boardName && (
              <>
                <span
                  className="font-semibold text-foreground/80 hover:text-foreground cursor-pointer truncate max-w-[160px]"
                  onClick={() => navigate(`/b/${card.boardId}`)}
                >
                  {card.boardName}
                </span>
                <span>/</span>
              </>
            )}

            {/* Current Column (static context — change it from the Status row below) */}
            <span
              className="px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/60 font-medium text-xs truncate max-w-[160px]"
              title={`Current column: ${lists?.find((l: any) => l.id === card.listId)?.name || card.listName || ''}`}
            >
              {lists?.find((l: any) => l.id === card.listId)?.name || card.listName || 'Backlog'}
            </span>

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

            {/* Priority / High Flame Indicator */}
            {card.priority === 'urgent' || card.priority === 'high' ? (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[11px] font-semibold">
                <Flame className="w-3 h-3 fill-amber-500 text-amber-500" />
                <span>High Priority</span>
              </div>
            ) : null}
          </div>

          {/* Right: Quick Action Controls, Mobile Tab Switcher & Dropdown */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Mobile Tab Switcher (Details vs Chat) */}
            <div className="flex lg:hidden items-center bg-muted/70 p-0.5 rounded-lg border border-border mr-1">
              <button
                type="button"
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  mobileActiveTab === 'details'
                    ? 'bg-background text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setMobileActiveTab('details')}
              >
                Task
              </button>
              <button
                type="button"
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                  mobileActiveTab === 'chat'
                    ? 'bg-background text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setMobileActiveTab('chat')}
              >
                <MessageSquare className="w-3 h-3" />
                <span>Chat ({comments.length})</span>
              </button>
            </div>

            {/* Share Button */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs text-foreground gap-1.5 cursor-pointer hover:bg-muted font-medium"
              onClick={() => setShowShareModal(true)}
              title="Share task & copy links"
            >
              <Share2 className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline">Share</span>
            </Button>

            {/* Three-Dot Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                    title="Task options"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                <div className="px-2 py-1.5 bg-muted/50 rounded-md border border-border/60 mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold text-foreground">
                    {taskIdentifier}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                    Identifier
                  </span>
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
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {taskIdentifier}
                  </span>
                </DropdownMenuItem>

                <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer text-xs gap-2">
                  <Copy className="w-3.5 h-3.5 text-primary" />
                  <span>{copiedLink ? 'Copied Link!' : 'Copy Task Link'}</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={async () => {
                    const branch = getGitBranchName(taskIdentifier, card.title);
                    await copyTextToClipboard(`git checkout -b ${branch}`);
                    setCopiedBranch(true);
                    setTimeout(() => setCopiedBranch(false), 2000);
                    toast.success('Git branch command copied');
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
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* ─── DUAL-PANE ENTERPRISE WORKSPACE (Bitrix24 Layout) ─── */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* ─── LEFT PANE: Task Specification & Management (60% width on Desktop) ─── */}
          <div
            className={`flex-1 overflow-y-auto p-4 sm:p-6 pb-36 space-y-4 min-w-0 bg-background ${
              mobileActiveTab === 'details' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
            }`}
          >
            {/* Subtask Banner */}
            {card.parentCard && (
              <div
                className="flex items-center gap-2 px-3.5 py-2 bg-muted/40 rounded-xl text-xs cursor-pointer hover:bg-muted/70 transition-colors border border-border/60"
                onClick={() =>
                  onSelectCard
                    ? onSelectCard(card.parentCard.id)
                    : navigate(`/cards/${card.parentCard.id}`)
                }
              >
                <Layers className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">Subtask of</span>
                <span className="font-semibold text-foreground underline">
                  {card.parentCard.title}
                </span>
              </div>
            )}

            {/* Task Title Header (Large, Crisp with inline editing) */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="w-full text-xl sm:text-2xl font-bold bg-transparent border-b border-transparent hover:border-border focus:border-ring focus:bg-muted/20 rounded-lg px-1.5 py-1 outline-none transition-colors text-foreground tracking-tight"
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

            {/* ─── REQUIREMENT / DESCRIPTION CARD (Bitrix24 Style with Edit & Expand) ─── */}
            <div
              id="section-status-summary"
              className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-sm font-bold text-foreground">
                    Requirement / Description
                  </span>
                  {isDescDirty && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-semibold flex items-center gap-1.5 border border-amber-500/20 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Unsaved changes
                    </span>
                  )}
                </div>

                {/* Action Buttons: Edit & Expand Toggle */}
                <div className="flex items-center gap-2">
                  {descTab === 'preview' && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer px-2 py-1 rounded hover:bg-primary/10"
                      onClick={() => setDescTab('write')}
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                  )}

                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-2 py-1 rounded hover:bg-muted"
                    onClick={() => setIsDescExpanded(!isDescExpanded)}
                  >
                    {isDescExpanded ? (
                      <>
                        <span>Collapse</span>
                        <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        <span>Expand</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Description Body */}
              {isDescExpanded && (
                <div>
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
                        <div className="w-px h-4 bg-border mx-1" />
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
                          title="Checklist item"
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
                        className="w-full min-h-[140px] p-3.5 bg-transparent border-0 outline-none text-xs leading-relaxed resize-y placeholder:text-muted-foreground"
                        placeholder="Add structured technical requirement, acceptance criteria, or context..."
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
                        <span className="flex items-center gap-1.5">
                          Markdown supported • <Kbd shortcut="mod+enter" /> to save
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
                            {updateCardMutation.isPending ? 'Saving...' : 'Save requirement'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {descriptionValue?.trim() ? (
                        <div
                          className="p-4 rounded-xl border border-border/70 bg-muted/15 min-h-[90px] text-xs text-foreground/90 hover:border-border transition-colors cursor-text leading-relaxed"
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (
                              target.tagName !== 'A' &&
                              target.tagName !== 'INPUT' &&
                              target.tagName !== 'BUTTON'
                            ) {
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
                          className="p-5 rounded-xl border border-dashed border-border bg-muted/10 hover:bg-muted/20 hover:border-primary/50 transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 text-center select-none"
                        >
                          <FileText className="w-5 h-5 text-muted-foreground/60" />
                          <p className="text-xs font-semibold text-foreground/80">
                            No requirement provided
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Click here to write technical specifications or acceptance criteria
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─── CARD 1: CORE METADATA GRID (Owner, Assignee, Deadline, Status, Created) ─── */}
            <div className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs relative">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3.5 gap-x-6 text-xs">
                {/* Task Owner */}
                <div className="flex items-center gap-3">
                  <span className="w-24 text-muted-foreground font-medium shrink-0">
                    Task owner:
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                      {card.creatorName
                        ? card.creatorName.substring(0, 2).toUpperCase()
                        : user?.name?.substring(0, 2).toUpperCase() || 'TO'}
                    </div>
                    <span className="font-semibold text-foreground truncate">
                      {card.creatorName || user?.name || 'System Owner'}
                    </span>
                  </div>
                </div>

                {/* Assignee with Floating Popover */}
                <div className="flex items-center gap-3 relative">
                  <span className="w-24 text-muted-foreground font-medium shrink-0">Assignee:</span>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {card.assignee ? (
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {card.assignee.avatarUrl ? (
                          <img
                            src={card.assignee.avatarUrl}
                            alt={card.assignee.name}
                            className="w-6 h-6 rounded-full object-cover shrink-0 ring-1 ring-border"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {card.assignee.name
                              ? card.assignee.name.substring(0, 2).toUpperCase()
                              : 'U'}
                          </div>
                        )}
                        <span className="font-semibold text-foreground truncate">
                          {card.assignee.name || card.assignee.email}
                        </span>
                        <button
                          type="button"
                          className="text-[11px] text-primary hover:underline font-medium ml-1 cursor-pointer"
                          onClick={() => setShowAssigneePicker(!showAssigneePicker)}
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                        onClick={() => setShowAssigneePicker(true)}
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Assign owner
                      </button>
                    )}
                  </div>

                  {/* Floating Popover for Assignee */}
                  {showAssigneePicker && (
                    <div
                      ref={assigneePickerRef}
                      className="absolute z-50 top-full left-0 mt-1.5 w-80 sm:w-96"
                    >
                      <MemberPicker
                        orgId={orgId}
                        assignedUserIds={assignedUserIds}
                        onAssign={(userId) => {
                          assignUserMutation.mutate(userId);
                        }}
                        onRemove={(userId) => {
                          removeUserMutation.mutate(userId);
                          setShowAssigneePicker(false);
                        }}
                        onClose={() => setShowAssigneePicker(false)}
                        currentUserId={user?.id}
                        title="Assign Task Owner"
                        mode="single"
                      />
                    </div>
                  )}
                </div>

                {/* Deadline / Due Date */}
                <div className="flex items-center gap-3">
                  <span className="w-24 text-muted-foreground font-medium shrink-0">Deadline:</span>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-sky-500 shrink-0" />
                    <div
                      className={`min-w-[150px] ${isDueOverdue ? '[&_button]:border-destructive [&_button]:text-destructive' : ''}`}
                    >
                      <DatePicker
                        value={card.dueDate ? card.dueDate.split('T')[0] : ''}
                        onChange={(v) =>
                          updateCardMutation.mutate({
                            dueDate: v ? new Date(v).toISOString() : null,
                          })
                        }
                        placeholder="Set deadline"
                        triggerClassName="h-7 px-2 bg-muted/40 border-border/80 font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* Status (column switcher lives here, next to the status itself) */}
                <div className="flex items-center gap-3">
                  <span className="w-24 text-muted-foreground font-medium shrink-0">Status:</span>
                  <div className="flex items-center gap-2">
                    <Hourglass className="w-4 h-4 text-amber-500 shrink-0" />
                    <ListSearchableSelect
                      lists={lists || []}
                      value={card.listId}
                      onChange={(val) => moveCardMutation.mutate(val)}
                      size="sm"
                      triggerClassName="h-7 px-2.5 text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25 hover:bg-amber-500/25 rounded-md"
                      className="w-auto min-w-[130px]"
                    />
                  </div>
                </div>

                {/* Created & Task ID */}
                <div className="flex items-center gap-3 sm:col-span-2 pt-2 border-t border-border/50 text-muted-foreground">
                  <span className="w-24 font-medium shrink-0">Created:</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>
                      {card.createdAt
                        ? format(new Date(card.createdAt), 'MMM d, yyyy · h:mm a')
                        : 'Recently'}
                    </span>
                    <span>/</span>
                    <span className="font-mono font-semibold text-foreground">
                      ID: {taskIdentifier}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await copyTextToClipboard(taskIdentifier);
                        setCopiedId(true);
                        setTimeout(() => setCopiedId(false), 2000);
                      }}
                      className="hover:text-foreground cursor-pointer"
                      title="Copy Task ID"
                    >
                      <Copy className="w-3.5 h-3.5 text-primary" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── CARD 2: AGILE / SCRUM & PROJECT CONTEXT ─── */}
            <div
              id="section-project"
              className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3.5 gap-x-6 text-xs">
                {/* Scrum / Project */}
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-24 text-muted-foreground font-medium shrink-0">Scrum:</span>
                  <div className="flex items-center gap-1.5 font-semibold text-foreground min-w-0 flex-1">
                    <div className="w-5 h-5 rounded-md bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                      <FolderGit2 className="w-3.5 h-3.5" />
                    </div>
                    <span className="truncate" title={card.boardName || 'DMS Dev Team'}>
                      {card.boardName || 'DMS Dev Team'}
                    </span>
                  </div>
                </div>

                {/* Stage */}
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-24 text-muted-foreground font-medium shrink-0">Stage:</span>
                  <div className="flex-1 max-w-[200px] min-w-0">
                    {stageTemplates && stageTemplates.length > 0 && stageTemplates[0].stages ? (
                      <SearchableSelect
                        options={[
                          { value: '', label: 'No Stage Assigned' },
                          ...stageTemplates[0].stages.map((stg: any) => ({
                            value: stg.id,
                            label: stg.name,
                            sublabel: stg.category,
                          })),
                        ]}
                        value={card.stageId || ''}
                        onChange={(val) => updateCardMutation.mutate({ stageId: val || null })}
                        placeholder="Select stage..."
                        size="sm"
                        triggerClassName="h-7 bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300 font-semibold text-xs"
                      />
                    ) : (
                      <span className="text-muted-foreground italic">Default Stage</span>
                    )}
                  </div>
                </div>

                {/* Epic / Sprint / Phase */}
                <div className="flex items-center gap-3">
                  <span className="w-24 text-muted-foreground font-medium shrink-0">Epic:</span>
                  <div className="flex-1 max-w-[200px]">
                    {sprints && sprints.length > 0 ? (
                      <SearchableSelect
                        options={[
                          { value: '', label: 'Select epic / sprint...' },
                          ...sprints.map((sp: any) => ({
                            value: sp.id,
                            label: `Sprint: ${sp.name}`,
                          })),
                          ...(phases || []).map((ph: any) => ({
                            value: ph.id,
                            label: `Phase: ${ph.name}`,
                          })),
                        ]}
                        value=""
                        onChange={(val) => {
                          if (val) sprintsService.addCardToSprint(val, cardId);
                        }}
                        placeholder="Select epic"
                        size="sm"
                        triggerClassName="h-7 bg-muted/40 text-xs"
                      />
                    ) : (
                      <span className="text-muted-foreground italic">No epic assigned</span>
                    )}
                  </div>
                </div>

                {/* Storypoints */}
                <div className="flex items-center gap-3">
                  <span className="w-24 text-muted-foreground font-medium shrink-0">
                    Storypoints:
                  </span>
                  <input
                    type="number"
                    min="0"
                    placeholder="-"
                    className="w-16 h-7 px-2 text-xs rounded-md bg-muted/40 border border-border/80 text-center font-bold text-foreground outline-none"
                    defaultValue={card.storyPoints ?? ''}
                    onBlur={(e) => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      if (val !== card.storyPoints) updateCardMutation.mutate({ storyPoints: val });
                    }}
                  />
                </div>
              </div>
            </div>

            {/* ─── CARD 3: PEOPLE / PARTICIPANTS & OBSERVERS ─── */}
            <div
              id="section-participants"
              className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs space-y-3 relative"
            >
              {/* Participants with Floating Popover */}
              <div className="flex items-start gap-3 text-xs relative">
                <span className="w-24 text-muted-foreground font-medium shrink-0 pt-1">
                  Participants:
                </span>
                <div className="flex-1 flex flex-wrap items-center gap-2">
                  {card.participants && card.participants.length > 0 ? (
                    card.participants.map((p: any) => (
                      <div
                        key={p.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-foreground"
                      >
                        {p.avatarUrl ? (
                          <img
                            src={p.avatarUrl}
                            alt={p.name}
                            className="w-4 h-4 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-blue-500/25 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[9px] font-bold">
                            {p.name ? p.name.substring(0, 1).toUpperCase() : 'U'}
                          </div>
                        )}
                        <span>{p.name || p.email}</span>
                        <button
                          type="button"
                          className="hover:text-destructive text-muted-foreground ml-0.5 cursor-pointer"
                          onClick={() => removeParticipantMutation.mutate(p.id)}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <span className="text-muted-foreground italic text-xs py-1">
                      No participants
                    </span>
                  )}
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer py-1"
                    onClick={() => setShowParticipantPicker(!showParticipantPicker)}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>

                {/* Floating Popover for Participants */}
                {showParticipantPicker && (
                  <div
                    ref={participantPickerRef}
                    className="absolute z-50 top-full left-0 mt-1.5 w-80 sm:w-96"
                  >
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

              {/* Observers with Floating Popover */}
              <div
                id="section-observers"
                className="flex items-start gap-3 text-xs pt-3 border-t border-border/50 relative"
              >
                <span className="w-24 text-muted-foreground font-medium shrink-0 pt-1">
                  Observers:
                </span>
                <div className="flex-1 flex flex-wrap items-center gap-2">
                  {card.watchers && card.watchers.length > 0 ? (
                    card.watchers.map((w: any) => (
                      <div
                        key={w.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs font-semibold text-foreground"
                      >
                        {w.avatarUrl ? (
                          <img
                            src={w.avatarUrl}
                            alt={w.name}
                            className="w-4 h-4 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-teal-500/25 text-teal-600 dark:text-teal-400 flex items-center justify-center text-[9px] font-bold">
                            {w.name ? w.name.substring(0, 1).toUpperCase() : 'U'}
                          </div>
                        )}
                        <span>{w.name || w.email}</span>
                        <button
                          type="button"
                          className="hover:text-destructive text-muted-foreground ml-0.5 cursor-pointer"
                          onClick={() => unwatchCardMutation.mutate(w.id)}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <span className="text-muted-foreground italic text-xs py-1">No observers</span>
                  )}

                  {user && (
                    <button
                      type="button"
                      className="text-xs text-teal-600 hover:underline font-semibold flex items-center gap-1 cursor-pointer py-1"
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
                          <EyeOff className="w-3.5 h-3.5" /> Unwatch
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" /> Watch
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer py-1"
                    onClick={() => setShowWatcherPicker(!showWatcherPicker)}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>

                {/* Floating Popover for Observers */}
                {showWatcherPicker && (
                  <div
                    ref={watcherPickerRef}
                    className="absolute z-50 top-full left-0 mt-1.5 w-80 sm:w-96"
                  >
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
            </div>

            {/* ─── CARD 4: TAGS ─── */}
            <div
              id="section-tags"
              className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs relative"
            >
              <div className="flex items-center gap-3 text-xs">
                <span className="w-24 text-muted-foreground font-medium shrink-0">Tags:</span>
                <div className="flex-1 flex flex-wrap items-center gap-1.5">
                  {card.labels && card.labels.length > 0 ? (
                    card.labels.map((lbl: any) => (
                      <span
                        key={lbl.id}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold"
                        style={{
                          backgroundColor: `${lbl.color}18`,
                          color: lbl.color,
                          border: `1px solid ${lbl.color}35`,
                        }}
                      >
                        <span>{lbl.name}</span>
                        <button
                          type="button"
                          className="hover:opacity-100 opacity-70 ml-0.5 cursor-pointer"
                          onClick={() =>
                            toggleLabelMutation.mutate({ labelId: lbl.id, hasLabel: true })
                          }
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-muted-foreground italic text-xs">No tags</span>
                  )}
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer ml-1"
                    onClick={() => setShowLabelPicker(!showLabelPicker)}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add tag
                  </button>
                </div>
              </div>

              {/* Floating Popover for Label Picker */}
              {showLabelPicker && (
                <div ref={labelPickerRef} className="absolute z-50 top-full left-0 mt-1.5 w-80">
                  <LabelPicker
                    boardId={card.boardId}
                    cardId={cardId}
                    cardLabelIds={cardLabelIds}
                    onClose={() => setShowLabelPicker(false)}
                  />
                </div>
              )}
            </div>

            {/* ─── CARD 5: SUBTASKS (Bitrix24 Interactive List) ─── */}
            <div
              id="section-subtasks"
              className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-bold text-foreground">
                    Subtasks: {subtasks.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Filter Subtasks: All vs Mine */}
                  <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg border border-border">
                    <button
                      type="button"
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                        subtaskFilter === 'all'
                          ? 'bg-background text-foreground shadow-2xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setSubtaskFilter('all')}
                    >
                      All ({subtasks.length})
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                        subtaskFilter === 'mine'
                          ? 'bg-background text-foreground shadow-2xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setSubtaskFilter('mine')}
                    >
                      Mine
                    </button>
                  </div>

                  <button
                    type="button"
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer ml-1"
                    onClick={handleCreateSubtask}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              </div>

              {/* Subtasks items list */}
              <div className="space-y-2">
                {filteredSubtasks.map((subtask: any) => {
                  const subAssignee = subtask.assignee || subtask.assignees?.[0];
                  return (
                    <div
                      key={subtask.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 cursor-pointer transition-all group"
                      onClick={() =>
                        onSelectCard ? onSelectCard(subtask.id) : navigate(`/cards/${subtask.id}`)
                      }
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {subtask.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {subAssignee && (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                            {subAssignee.avatarUrl ? (
                              <img
                                src={subAssignee.avatarUrl}
                                alt={subAssignee.name}
                                className="w-3.5 h-3.5 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">
                                {subAssignee.name
                                  ? subAssignee.name.substring(0, 1).toUpperCase()
                                  : 'U'}
                              </div>
                            )}
                            <span className="truncate max-w-[80px]">{subAssignee.name}</span>
                          </div>
                        )}

                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          {subtask.listName || card?.listName || 'To Do'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Full Subtask Composer (parent locked to this task) */}
            {showSubtaskComposer && (
              <Suspense fallback={<RouteFallback label="Loading composer…" />}>
                <CreateTaskModal
                  lists={lists}
                  members={[]}
                  currentUser={user}
                  isOpen={showSubtaskComposer}
                  initialData={{
                    listId: card?.listId,
                  }}
                  parentCardId={cardId}
                  parentCardTitle={card?.title}
                  boardId={card?.boardId}
                  orgId={orgId}
                  onClose={() => {
                    setShowSubtaskComposer(false);
                  }}
                  onTaskCreated={(sub) => {
                    queryClient.invalidateQueries({ queryKey: ['card', cardId, 'subtasks'] });
                    setShowSubtaskComposer(false);
                    if (sub?.id && onSelectCard) onSelectCard(sub.id);
                  }}
                />
              </Suspense>
            )}

            {/* ─── CARD 6: CUSTOM FIELDS (Clean Date & Estimation) ─── */}
            <div
              id="section-custom-fields"
              className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs space-y-3"
            >
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-bold text-foreground">Custom fields</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="w-24 text-muted-foreground font-medium shrink-0">
                    Assigned Date:
                  </span>
                  <span className="font-semibold text-foreground">
                    {card.createdAt
                      ? format(new Date(card.createdAt), 'MMMM d, yyyy')
                      : 'August 10, 2026'}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="w-24 text-muted-foreground font-medium shrink-0">
                    Estimated:
                  </span>
                  <span className="font-semibold text-foreground">
                    {card.estimateMinutes
                      ? `${(card.estimateMinutes / 60).toFixed(1)} hrs`
                      : 'Not set'}
                  </span>
                </div>
              </div>
            </div>

            {/* ─── CARD 7: TIME TRACKING ─── */}
            <div
              id="section-time-tracking"
              className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-bold text-foreground">
                    Time Tracking & Worklogs
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isTimerRunning && (
                    <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-600 text-xs font-mono font-bold animate-pulse">
                      ⏱ {formatTimer(timerSeconds)}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 cursor-pointer"
                    onClick={() => setIsLoggingTime(!isLoggingTime)}
                  >
                    <Plus className="w-3.5 h-3.5" /> Log Time
                  </Button>
                </div>
              </div>

              {/* Time progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    Logged:{' '}
                    <strong className="text-foreground">
                      {(totalLoggedMinutes / 60).toFixed(1)}h
                    </strong>
                  </span>
                  <span>
                    Estimate:{' '}
                    <strong className="text-foreground">
                      {estimateMinutes ? `${(estimateMinutes / 60).toFixed(1)}h` : 'None'}
                    </strong>
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      estimateMinutes > 0 && totalLoggedMinutes > estimateMinutes
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${estimateMinutes > 0 ? timeProgressPercent : 100}%` }}
                  />
                </div>
              </div>

              {isLoggingTime && (
                <div className="p-3.5 bg-muted/40 border border-border rounded-xl space-y-3 mt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Hours</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        className="h-8 text-sm bg-background"
                        value={logHours}
                        onChange={(e) => setLogHours(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Minutes</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="30"
                        className="h-8 text-sm bg-background"
                        value={logMinutes}
                        onChange={(e) => setLogMinutes(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Date</Label>
                    <DatePicker
                      value={logDate}
                      onChange={setLogDate}
                      triggerClassName="h-8 text-sm bg-background"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Work Note</Label>
                    <Input
                      placeholder="Describe work completed..."
                      className="h-8 text-sm bg-background"
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
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Time logs history entries */}
              {timeTrackingData?.timeLogs && timeTrackingData.timeLogs.length > 0 && (
                <div className="space-y-1.5 mt-2 pt-2 border-t border-border/50">
                  {timeTrackingData.timeLogs.slice(0, 4).map((log: any) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/20 border border-border/50 group hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {(log.minutes / 60).toFixed(1)} hrs
                        </span>
                        <span className="text-muted-foreground truncate max-w-[180px]">
                          {log.description || 'Work logged'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{log.loggedDate}</span>
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity p-0.5 cursor-pointer"
                          onClick={() => deleteTimeLogMutation.mutate(log.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─── CARD 8: CHECKLISTS & ACCEPTANCE CRITERIA ─── */}
            <div
              id="section-checklists"
              className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs space-y-4"
            >
              {/* Checklists List (real rows only — never a phantom draft) */}
              {checklists && checklists.length > 0 ? (
                checklists.map((cl: any) => {
                  const totalItems = cl.items?.length || 0;
                  const doneItems = cl.items?.filter((i: any) => i.isDone).length || 0;
                  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
                  const isCollapsed = collapsedChecklistIds.has(cl.id);
                  const isEditingTitle = editingChecklistId === cl.id;
                  const isAddingItem = addingItemChecklistId === cl.id;

                  return (
                    <div key={cl.id} className="space-y-2.5">
                      {/* Header Row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <ListChecks className="w-4 h-4 sm:w-5 sm:h-5 text-sky-500 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            {isEditingTitle ? (
                              <div className="flex items-center gap-2 max-w-sm">
                                <Input
                                  value={editingChecklistTitle}
                                  onChange={(e) => setEditingChecklistTitle(e.target.value)}
                                  className="h-7 text-xs bg-background"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && editingChecklistTitle.trim()) {
                                      if (cl.id) {
                                        updateChecklistMutation.mutate({
                                          checklistId: cl.id,
                                          title: editingChecklistTitle.trim(),
                                        });
                                      }
                                    } else if (e.key === 'Escape') {
                                      setEditingChecklistId(null);
                                    }
                                  }}
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  className="h-7 px-2.5 text-xs font-semibold"
                                  disabled={
                                    !editingChecklistTitle.trim() ||
                                    updateChecklistMutation.isPending
                                  }
                                  onClick={() => {
                                    if (editingChecklistTitle.trim()) {
                                      if (cl.id) {
                                        updateChecklistMutation.mutate({
                                          checklistId: cl.id,
                                          title: editingChecklistTitle.trim(),
                                        });
                                      }
                                    }
                                  }}
                                >
                                  Save
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setEditingChecklistId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <h4
                                  className="text-sm sm:text-base font-bold text-foreground hover:text-primary cursor-pointer truncate transition-colors inline-block"
                                  // I dont want the user to edit after clicking on it the current setup is okay
                                  // onClick={() => {
                                  //   setEditingChecklistId(cl.id);
                                  //   setEditingChecklistTitle(cl.title || 'Checklist #1');
                                  // }}
                                  title="Click to rename checklist"
                                >
                                  {cl.title || 'Checklist #1'}
                                </h4>
                                {/* Subtitle with Progress Bar */}
                                <div className="flex items-center gap-2 text-xs text-muted-foreground font-normal">
                                  <span>
                                    Completed {doneItems} out of {totalItems}
                                  </span>
                                  <div className="w-20 sm:w-28 bg-muted/80 rounded-full h-1.5 overflow-hidden inline-flex align-middle">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        pct === 100 ? 'bg-emerald-500' : 'bg-sky-500'
                                      }`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Header Actions */}
                        <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
                          {/* More Menu */}
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg"
                                  title="Checklist options"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent
                              align="end"
                              className="w-44 p-1 rounded-xl border border-border shadow-md bg-popover"
                            >
                              <DropdownMenuItem
                                className="text-xs gap-2 cursor-pointer font-medium"
                                onClick={() => {
                                  setEditingChecklistId(cl.id);
                                  setEditingChecklistTitle(cl.title || 'Checklist #1');
                                }}
                              >
                                <Edit3 className="w-3.5 h-3.5" /> Rename checklist
                              </DropdownMenuItem>
                              {cl.id && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-xs gap-2 cursor-pointer font-medium text-destructive focus:text-destructive"
                                    onClick={() =>
                                      setConfirmDeleteChecklist({
                                        id: cl.id,
                                        title: cl.title || 'Checklist #1',
                                        itemCount: cl.items?.length || 0,
                                      })
                                    }
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Delete checklist
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>

                          {/* Chevron Collapse / Expand */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg"
                            onClick={() => toggleChecklistCollapse(cl.id)}
                            title={isCollapsed ? 'Expand checklist' : 'Collapse checklist'}
                          >
                            {isCollapsed ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronUp className="w-4 h-4" />
                            )}
                          </Button>

                          {/* Delete / Close X */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer rounded-lg"
                            onClick={() => {
                              if (cl.id) {
                                setConfirmDeleteChecklist({
                                  id: cl.id,
                                  title: cl.title || 'Checklist #1',
                                  itemCount: cl.items?.length || 0,
                                });
                              }
                            }}
                            title="Delete checklist"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="border-t border-border/60 my-2" />

                      {/* Items Body */}
                      {!isCollapsed && (
                        <div className="space-y-1.5 min-h-[36px]">
                          {/* Add Item Button / Input */}
                          {isAddingItem ? (
                            <div className="py-1">
                              <div className="flex items-start gap-2">
                                <div className="relative flex-1">
                                  <textarea
                                    rows={1}
                                    placeholder="Add checklist item…"
                                    className="w-full min-h-8 max-h-40 overflow-y-auto resize-none rounded-md border border-input bg-background px-3 py-1.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    value={addingItemText}
                                    onChange={(e) => setAddingItemText(e.target.value)}
                                    onInput={(e) => {
                                      // Auto-grow with content, capped so long lists scroll instead
                                      const el = e.currentTarget;
                                      el.style.height = 'auto';
                                      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                                    }}
                                    onPaste={(e) => {
                                      const pasted = e.clipboardData.getData('text');
                                      if (pasted && pasted.includes('\n')) {
                                        const lines = pasted
                                          .split('\n')
                                          .map((l) => l.trim())
                                          .filter(Boolean);
                                        if (lines.length > 1) {
                                          e.preventDefault();
                                          handleSaveItemOrBulk(cl.id, lines);
                                        }
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      // Enter = save, Shift+Enter = newline (market standard),
                                      // Escape = cancel. Skip while IME composition is active.
                                      if (e.nativeEvent.isComposing) return;
                                      if (
                                        e.key === 'Enter' &&
                                        !e.shiftKey &&
                                        addingItemText.trim()
                                      ) {
                                        e.preventDefault();
                                        const val = addingItemText.trim();
                                        if (val.includes('\n')) {
                                          const lines = val
                                            .split('\n')
                                            .map((l) => l.trim())
                                            .filter(Boolean);
                                          handleSaveItemOrBulk(cl.id, lines);
                                        } else {
                                          handleSaveItemOrBulk(cl.id, [val]);
                                        }
                                      } else if (e.key === 'Escape') {
                                        setAddingItemChecklistId(null);
                                        setAddingItemText('');
                                      }
                                    }}
                                    autoFocus
                                  />
                                  {!addingItemText && (
                                    <span className="pointer-events-none absolute right-2.5 top-[7px] flex items-center gap-1 text-[11px] leading-4 text-muted-foreground/70 select-none">
                                      <kbd className="rounded border border-border bg-muted px-1 py-px font-sans text-[10px] font-medium">
                                        Shift
                                      </kbd>
                                      <span>+</span>
                                      <kbd className="rounded border border-border bg-muted px-1 py-px font-sans text-[10px] font-medium">
                                        Enter
                                      </kbd>
                                      <span>for a new line</span>
                                    </span>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  className="h-8 text-xs font-semibold"
                                  disabled={
                                    !addingItemText.trim() ||
                                    addItemMutation.isPending ||
                                    addBulkItemsMutation.isPending
                                  }
                                  onClick={() => {
                                    if (addingItemText.trim()) {
                                      const val = addingItemText.trim();
                                      if (val.includes('\n')) {
                                        const lines = val
                                          .split('\n')
                                          .map((l) => l.trim())
                                          .filter(Boolean);
                                        handleSaveItemOrBulk(cl.id, lines);
                                      } else {
                                        handleSaveItemOrBulk(cl.id, [val]);
                                      }
                                    }
                                  }}
                                >
                                  Add
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => {
                                    setAddingItemChecklistId(null);
                                    setAddingItemText('');
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground hover:text-foreground font-normal py-1 px-1 rounded-md transition-colors cursor-pointer w-fit"
                              onClick={() => {
                                setAddingItemChecklistId(cl.id);
                                setAddingItemText('');
                              }}
                            >
                              <Plus className="w-4 h-4 text-muted-foreground" />
                              <span>Add item</span>
                            </button>
                          )}

                          {/* Items List */}
                          {cl.items?.map((item: any) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-muted/40 group/item transition-colors"
                            >
                              <label className="flex items-center gap-2.5 cursor-pointer text-xs sm:text-sm flex-1 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={item.isDone}
                                  onChange={(e) => {
                                    toggleItemMutation.mutate({
                                      itemId: item.id,
                                      isDone: e.target.checked,
                                    });
                                  }}
                                  className="w-3.5 h-3.5 rounded accent-sky-500 cursor-pointer shrink-0"
                                />
                                <span
                                  className={`truncate ${
                                    item.isDone
                                      ? 'line-through text-muted-foreground'
                                      : 'text-foreground'
                                  }`}
                                >
                                  {item.text}
                                </span>
                              </label>
                              <button
                                type="button"
                                className="opacity-0 group-hover/item:opacity-100 hover:text-destructive transition-opacity p-0.5 cursor-pointer text-muted-foreground"
                                onClick={() => {
                                  deleteChecklistItemMutation.mutate(item.id);
                                }}
                                title="Delete item"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground py-1">
                  No checklists yet. Use “New checklist” below to create one.
                </p>
              )}

              {/* Bottom Actions Bar: form replaces the trigger + Save while open */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/60 mt-4">
                {showNewChecklist ? (
                  <>
                    <Input
                      placeholder="Checklist title (e.g. Acceptance Criteria, Verification Steps)..."
                      className="h-8 text-xs bg-background flex-1"
                      value={newChecklistTitle}
                      onChange={(e) => setNewChecklistTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newChecklistTitle.trim()) {
                          addChecklistMutation.mutate({ title: newChecklistTitle.trim() });
                        } else if (e.key === 'Escape') {
                          setShowNewChecklist(false);
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-8 text-xs font-semibold shrink-0"
                      disabled={!newChecklistTitle.trim() || addChecklistMutation.isPending}
                      onClick={() => {
                        if (newChecklistTitle.trim()) {
                          addChecklistMutation.mutate({ title: newChecklistTitle.trim() });
                        }
                      }}
                    >
                      Create
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs shrink-0"
                      onClick={() => {
                        setShowNewChecklist(false);
                        setNewChecklistTitle('');
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground hover:text-foreground font-normal py-1.5 px-1 rounded-md transition-colors cursor-pointer"
                      onClick={() => {
                        setNewChecklistTitle('');
                        setShowNewChecklist(true);
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      <span>New checklist</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ─── CARD 9: FILES & ATTACHMENTS ─── */}
            <div
              id="section-files"
              className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-sky-500" />
                  <span className="text-sm font-bold text-foreground">
                    Files ({attachments.length})
                  </span>
                </div>
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

              {attachments.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {attachments.map((att: any) => (
                    <div
                      key={att.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors group"
                    >
                      {att.fileType?.startsWith('image/') ||
                      /\.(png|jpe?g|gif|webp|svg)$/i.test(att.fileName) ? (
                        <img
                          src={att.url}
                          alt={att.fileName}
                          className="w-10 h-10 rounded-lg object-cover bg-muted shrink-0 border border-border/60"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center font-bold text-[10px] uppercase text-muted-foreground shrink-0">
                          {att.fileName.split('.').pop() || 'FILE'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-xs truncate hover:underline block text-foreground"
                        >
                          {att.fileName}
                        </a>
                        <span className="text-[10px] text-muted-foreground block mt-0.5">
                          {att.sizeBytes ? `${(att.sizeBytes / 1024).toFixed(0)} KB` : ''}
                        </span>
                      </div>
                      <button
                        className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity p-1 text-muted-foreground cursor-pointer"
                        onClick={() => deleteAttachmentMutation.mutate(att.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No files attached yet</p>
              )}
            </div>

            {/* ─── ACTION RIBBON (Quick Navigation Pills) ─── */}
            <TaskActionRibbon
              onSelectSection={handleScrollToSection}
              counts={{
                files: attachments.length,
                checklists: checklists.length,
                participants: card.participants?.length,
                observers: card.watchers?.length,
                subtasks: subtasks.length,
                tags: card.labels?.length,
                timeLogs: timeTrackingData?.timeLogs?.length,
              }}
            />
          </div>

          {/* ─── RIGHT PANE: Dedicated Task Chat & Real-Time Activity Stream (40% width on Desktop) ─── */}
          <div
            className={`w-full lg:w-[420px] xl:w-[480px] shrink-0 h-full min-h-0 ${
              mobileActiveTab === 'chat' ? 'flex flex-col flex-1' : 'hidden lg:flex lg:flex-col'
            }`}
          >
            <TaskChatPane
              cardId={cardId}
              cardTitle={card.title}
              boardId={card.boardId}
              defaultListId={card.listId}
              membersCount={uniqueMemberCount}
              comments={comments}
              systemActivities={systemActivities}
              participantUserIds={participantUserIds}
              onAddParticipant={(userId) => addParticipantMutation.mutate(userId)}
              onRemoveParticipant={(userId) => removeParticipantMutation.mutate(userId)}
              onSendMessage={async (body, mentionedUserIds) => {
                await addCommentMutation.mutateAsync({ body, mentionedUserIds });
              }}
              onEditMessage={async (commentId, body) => {
                await editCommentMutation.mutateAsync({ commentId, body });
              }}
              onDeleteMessage={async (commentId) => {
                await deleteCommentMutation.mutateAsync(commentId);
              }}
              onUploadAttachment={async (file) => {
                return await uploadAttachmentMutation.mutateAsync(file);
              }}
              isSending={addCommentMutation.isPending}
            />
          </div>
        </div>

        {/* ─── STICKY ENTERPRISE ACTION BOTTOM BAR (Bitrix24 Style) ─── */}
        <div className="absolute bottom-0 left-0 right-0 lg:right-[420px] xl:right-[480px] px-4 sm:px-6 py-3 sm:py-3.5 bg-card/95 backdrop-blur-md border-t border-border/80 flex items-center justify-between gap-3 z-30 shadow-xl">
          <div className="flex items-center gap-2">
            {/* Start / Pause Button */}
            <Button
              size="sm"
              className={`h-8 px-4 font-bold text-xs gap-1.5 shadow-2xs cursor-pointer ${
                isTimerRunning
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-sky-600 hover:bg-sky-700 text-white'
              }`}
              onClick={handleStartTask}
            >
              {isTimerRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-white" /> Pause ({formatTimer(timerSeconds)})
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-white" /> Start
                </>
              )}
            </Button>

            {/* Complete Button */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-4 font-semibold text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 gap-1.5 cursor-pointer"
              onClick={handleCompleteTask}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Complete
            </Button>

            {/* Three-Dot Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="w-48 p-1.5">
                <DropdownMenuItem onClick={handleCloneTask} className="text-xs cursor-pointer">
                  Clone Task
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCreateSubtask} className="text-xs cursor-pointer">
                  Add Subtask
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowArchiveConfirm(true)}
                  className="text-xs cursor-pointer"
                >
                  Archive Task
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeleteConfirm(true)}
                  variant="destructive"
                  className="text-xs cursor-pointer"
                >
                  Delete Task
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Right: Rate task & Views */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
            <button
              type="button"
              className="hover:text-amber-500 transition-colors flex items-center gap-1 cursor-pointer"
              onClick={() => setShowRateModal(true)}
            >
              <Star
                className={`w-3.5 h-3.5 ${
                  userRating > 0 ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground'
                }`}
              />
              <span>{userRating > 0 ? `${userRating} Stars` : 'Rate task'}</span>
            </button>

            <div className="flex items-center gap-1" title="Active viewers on card">
              <Eye className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{uniqueMemberCount}</span>
            </div>
          </div>
        </div>

        {/* ─── Rate Task Popover Modal ─── */}
        {showRateModal && (
          <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4 text-center">
              <h4 className="text-base font-bold text-foreground">Rate this task execution</h4>
              <p className="text-xs text-muted-foreground">Provide team performance rating</p>
              <div className="flex justify-center gap-2 py-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setUserRating(s)}
                    className="cursor-pointer p-1 hover:scale-125 transition-transform"
                  >
                    <Star
                      className={`w-6 h-6 ${
                        s <= userRating
                          ? 'text-amber-500 fill-amber-500'
                          : 'text-muted-foreground/40'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs cursor-pointer"
                  onClick={() => setShowRateModal(false)}
                >
                  Close
                </Button>
                <Button
                  size="sm"
                  className="text-xs cursor-pointer"
                  onClick={() => {
                    localStorage.setItem(`task-rating-${cardId}`, String(userRating));
                    toast.success(`Rated ${userRating} stars!`);
                    setShowRateModal(false);
                  }}
                >
                  Submit Rating
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ─── In-Modal Unsaved Changes Confirmation Dialog ─── */}
        {showUnsavedPrompt && (
          <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in-50 duration-150">
            <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col">
              <div className="p-6 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 border border-amber-500/20">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-foreground tracking-tight">
                      Unsaved Changes
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      You have unsaved modifications in the requirement description.
                    </p>
                  </div>
                </div>
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
                  Save & Close
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

        {/* ─── Delete Checklist Confirmation Dialog ─── */}
        <ConfirmDialog
          open={!!confirmDeleteChecklist}
          onOpenChange={(open) => {
            if (!open) setConfirmDeleteChecklist(null);
          }}
          title="Delete Checklist"
          description={
            confirmDeleteChecklist
              ? `Are you sure you want to delete "${confirmDeleteChecklist.title.replace(/^"+|"+$/g, '')}"${
                  confirmDeleteChecklist.itemCount > 0
                    ? ` and its ${confirmDeleteChecklist.itemCount} item${confirmDeleteChecklist.itemCount === 1 ? '' : 's'}`
                    : ''
                }? This action cannot be undone.`
              : ''
          }
          confirmLabel="Delete Checklist"
          variant="destructive"
          isLoading={deleteChecklistMutation.isPending}
          onConfirm={() => {
            if (confirmDeleteChecklist) {
              deleteChecklistMutation.mutate(confirmDeleteChecklist.id, {
                onSuccess: () => setConfirmDeleteChecklist(null),
              });
            }
          }}
        />

        {/* ─── Delete Task Confirmation Dialog ─── */}
        <ConfirmDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          title="Permanently Delete Task Card"
          description={`Are you sure you want to permanently delete "${card?.title || 'this task card'}"? This action cannot be undone.`}
          confirmLabel="Delete Card"
          variant="destructive"
          isLoading={deleteCardMutation.isPending}
          onConfirm={() => deleteCardMutation.mutate()}
        />
      </div>
    );
  }
);
