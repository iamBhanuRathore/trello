import {
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  lazy,
  Suspense,
  useMemo,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage, logCardTime, deleteTimeLog } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { stagesService } from '../../lib/stagesService';
import { sprintsService } from '../../lib/sprintsService';
import { phasesService } from '../../lib/phasesService';
import { priorityService } from '../../lib/priorityService';
import { useOptimisticMutation } from '../../lib/useOptimisticMutation';
import { usePageMetadata } from '../../hooks/usePageMetadata';
import {
  getTaskIdentifier,
  getGitBranchName,
  copyTextToClipboard,
} from '../../utils/taskIdentifier';
import { toast } from 'sonner';
import type { PermissionKey } from '@boardly/shared-types';
import { usePermissions, permissionReason } from '../../hooks/usePermissions';

// Extracted Domain Subcomponents
import { TaskDetailHeader } from './task-detail/TaskDetailHeader';
import { TaskDescriptionCard } from './task-detail/TaskDescriptionCard';
import { TaskMetadataGrid } from './task-detail/TaskMetadataGrid';
import { TaskSubtasksCard } from './task-detail/TaskSubtasksCard';
import { TaskCustomFieldsCard } from './task-detail/TaskCustomFieldsCard';
import { TaskTimeTrackingCard } from './task-detail/TaskTimeTrackingCard';
import { TaskChecklistsCard } from './task-detail/TaskChecklistsCard';
import { TaskAttachmentsCard } from './task-detail/TaskAttachmentsCard';
import { TaskDetailBottomBar } from './task-detail/TaskDetailBottomBar';
import { TaskRateModal } from './task-detail/TaskRateModal';

// Board & Modal Components
import { GitDevSection } from './GitDevSection';
import { TaskChatPane } from './TaskChatPane';
import { TaskActionRibbon } from './TaskActionRibbon';
import { ShareTaskModal } from './ShareTaskModal';
import { CloneCardDialog } from './clone/CloneCardDialog';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { RouteFallback } from '../common/RouteFallback';
import { Layers } from 'lucide-react';
import { useDialogClose } from '../../hooks/useDialogClose';

// Lazy modal
const CreateTaskModal = lazy(() =>
  import('./CreateTaskModal').then((m) => ({ default: m.CreateTaskModal }))
);

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
    const user = useAuthStore((state) => state.user);
    const orgId = user?.organizationId;

    // Mobile Responsive Tab (Details vs Chat)
    const [mobileActiveTab, setMobileActiveTab] = useState<'details' | 'chat'>('details');

    // Description States
    const [descTab, setDescTab] = useState<'write' | 'preview'>('preview');
    const [isDescExpanded, setIsDescExpanded] = useState<boolean>(true);
    const [descriptionValue, setDescriptionValue] = useState<string>('');
    const [isDescDirty, setIsDescDirty] = useState<boolean>(false);
    const [showUnsavedPrompt, setShowUnsavedPrompt] = useState<boolean>(false);
    const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

    // Time Tracking & Timer States
    const [isLoggingTime, setIsLoggingTime] = useState<boolean>(false);
    const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
    const [timerSeconds, setTimerSeconds] = useState<number>(0);
    const [logHours, setLogHours] = useState<string>('');
    const [logMinutes, setLogMinutes] = useState<string>('');
    const [logDescription, setLogDescription] = useState<string>('');
    const [logIsBillable, setLogIsBillable] = useState<boolean>(true);
    const [logDate, setLogDate] = useState<string>(new Date().toISOString().split('T')[0]);

    // Dialog / Modal States
    const [showShareModal, setShowShareModal] = useState<boolean>(false);
    const [copiedId, setCopiedId] = useState<boolean>(false);
    const [copiedLink, setCopiedLink] = useState<boolean>(false);
    const [copiedBranch, setCopiedBranch] = useState<boolean>(false);
    const [showArchiveConfirm, setShowArchiveConfirm] = useState<boolean>(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
    const [showSubtaskComposer, setShowSubtaskComposer] = useState<boolean>(false);
    // 'clone' | 'subtask' | null — Clone Task and Clone & Create Subtask both
    // open the same review dialog instead of cloning on click.
    const [cloneMode, setCloneMode] = useState<'clone' | 'subtask' | null>(null);
    const [showRateModal, setShowRateModal] = useState<boolean>(false);
    const [userRating, setUserRating] = useState<number>(() => {
      try {
        const saved = localStorage.getItem(`task-rating-${cardId}`);
        return saved ? Number(saved) : 0;
      } catch {
        return 0;
      }
    });
    const [confirmDeleteChecklist, setConfirmDeleteChecklist] = useState<{
      id: string;
      title: string;
      itemCount: number;
    } | null>(null);

    // Timer Interval
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

    // Data Fetching
    const { data: card, isLoading: isCardLoading } = useQuery({
      queryKey: ['card', cardId],
      queryFn: async () => {
        const res = await api.get(`/cards/${cardId}`);
        return res.data;
      },
      enabled: !!cardId,
    });

    // Description Sync
    useEffect(() => {
      if (!isDescDirty) {
        setDescriptionValue(card?.description || '');
      }
    }, [card?.description, isDescDirty]);

    const taskIdentifier = getTaskIdentifier(card);

    // Dynamic Metadata
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
      staleTime: 5 * 60_000,
    });

    // The catch used to `return []`, which made a failed request indistinguishable
    // from "this org has no stage templates": the Stage picker silently rendered
    // empty with no error and no retry. Rethrow so TanStack Query owns the error
    // state and the panel can surface it.
    const {
      data: stageTemplates,
      isError: stagesError,
      isLoading: stagesLoading,
      refetch: refetchStages,
    } = useQuery({
      queryKey: ['stageTemplatesWithStages', orgId],
      queryFn: async () => {
        const ts = await stagesService.getTemplates(orgId!);
        if (ts && ts.length > 0) {
          // The detail call depends on the id from the list call, so it cannot
          // be issued in parallel — but the whole thing is behind a 5-minute
          // staleTime and only runs on first open of the task modal.
          const fullTemplate = await stagesService.getTemplate(ts[0].id);
          ts[0].stages = fullTemplate?.stages || [];
        }
        return ts || [];
      },
      enabled: !!orgId,
      staleTime: 5 * 60_000,
    });

    const { data: sprints } = useQuery({
      queryKey: ['sprints', card?.projectId],
      queryFn: () => sprintsService.getSprints(card!.projectId),
      enabled: !!card?.projectId,
      staleTime: 5 * 60_000,
    });

    const { data: phases } = useQuery({
      queryKey: ['phases', card?.projectId],
      queryFn: () => phasesService.getPhases(card!.projectId),
      enabled: !!card?.projectId,
      staleTime: 5 * 60_000,
    });

    const { data: priorities = [] } = useQuery({
      queryKey: ['priorities'],
      queryFn: () => priorityService.list(),
      staleTime: 5 * 60_000,
    });

    // Sub-collections
    const comments: any[] = card?.comments ?? [];
    const checklists: any[] = card?.checklists ?? [];
    const attachments: any[] = card?.attachments ?? [];
    const subtasks: any[] = card?.subtasks ?? [];
    const timeTrackingData = card?.timeTracking;

    // Time calculations
    const totalLoggedMinutes =
      timeTrackingData?.timeLogs?.reduce((acc: number, log: any) => acc + (log.minutes || 0), 0) ||
      0;
    const estimateMinutes = card?.estimateMinutes || 0;
    const timeProgressPercent =
      estimateMinutes > 0
        ? Math.min(100, Math.round((totalLoggedMinutes / estimateMinutes) * 100))
        : 0;

    const formatTimer = (totalSeconds: number) => {
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Mutations
    const updateCardMutation = useMutation({
      mutationFn: async (data: any) => await api.patch(`/cards/${cardId}`, data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
        queryClient.invalidateQueries({ queryKey: ['lists', card?.boardId] });
      },
      onError: (err: unknown) => {
        toast.error(getApiErrorMessage(err, 'Unable to update the task.'));
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
      },
      onError: (err: unknown) => {
        toast.error(getApiErrorMessage(err, 'Unable to assign the task.'));
      },
    });

    const removeUserMutation = useMutation({
      mutationFn: async (userId: string) =>
        await api.delete(`/cards/${cardId}/assignees/${userId}`),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      },
      onError: (err: unknown) => {
        toast.error(getApiErrorMessage(err, 'Unable to remove the assignee.'));
      },
    });

    const addParticipantMutation = useMutation({
      mutationFn: async (userId: string) =>
        await api.post(`/cards/${cardId}/participants`, { userId }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      },
      onError: (err: unknown) => {
        toast.error(getApiErrorMessage(err, 'Unable to add the participant.'));
      },
    });

    const removeParticipantMutation = useMutation({
      mutationFn: async (userId: string) =>
        await api.delete(`/cards/${cardId}/participants/${userId}`),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      },
      onError: (err: unknown) => {
        toast.error(getApiErrorMessage(err, 'Unable to remove the participant.'));
      },
    });

    const watchCardMutation = useMutation({
      mutationFn: async (userId?: string) => await api.post(`/cards/${cardId}/watch`, { userId }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
        queryClient.invalidateQueries({ queryKey: ['card-watchers', cardId] });
      },
      onError: (err: unknown) => {
        toast.error(getApiErrorMessage(err, 'Unable to start watching this task.'));
      },
    });

    const unwatchCardMutation = useMutation({
      mutationFn: async (userId?: string) => await api.post(`/cards/${cardId}/unwatch`, { userId }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
        queryClient.invalidateQueries({ queryKey: ['card-watchers', cardId] });
      },
      onError: (err: unknown) => {
        toast.error(getApiErrorMessage(err, 'Unable to stop watching this task.'));
      },
    });

    const updateWatchersMutation = useOptimisticMutation<
      void,
      {
        add: string[];
        remove: string[];
        staged: Array<{ id: string; name?: string; email?: string; avatarUrl?: string | null }>;
      }
    >(
      async ({ add, remove }) => {
        await Promise.all([
          ...add.map((userId) => api.post(`/cards/${cardId}/watch`, { userId })),
          ...remove.map((userId) => api.post(`/cards/${cardId}/unwatch`, { userId })),
        ]);
      },
      {
        queryKeys: [['card', cardId]],
        applyOptimistic: ({ staged }) => {
          queryClient.setQueryData(['card', cardId], (old: any) =>
            old ? { ...old, watchers: staged } : old
          );
        },
        errorMessage: 'Failed to update observers. Please try again.',
      }
    );

    const toggleLabelMutation = useMutation({
      mutationFn: async ({ labelId, hasLabel }: { labelId: string; hasLabel: boolean }) => {
        if (hasLabel) {
          await api.delete(`/cards/${cardId}/labels/${labelId}`);
        } else {
          await api.post(`/cards/${cardId}/labels`, { labelId });
        }
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
        // Board tiles embed labels — refresh the aggregate payload too,
        // otherwise the kanban card keeps showing stale tags.
        queryClient.invalidateQueries({ queryKey: ['board', 'full'] });
        if (card?.boardId) {
          queryClient.invalidateQueries({ queryKey: ['boardLabels', card.boardId] });
        }
      },
      onError: (err: unknown) => {
        toast.error(getApiErrorMessage(err, 'Unable to update labels.'));
      },
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
      onError: (err: unknown) => {
        toast.error(getApiErrorMessage(err, 'Unable to post the comment.'));
      },
    });

    const editCommentMutation = useMutation({
      mutationFn: async ({ commentId, body }: { commentId: string; body: string }) =>
        await api.patch(`/cards/comments/${commentId}`, { body }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'comments'] });
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      },
      onError: (err: any) => {
        toast.error(err?.response?.data?.message || err?.message || 'Failed to update comment');
      },
    });

    const deleteCommentMutation = useMutation({
      mutationFn: async (commentId: string) => await api.delete(`/cards/comments/${commentId}`),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'comments'] });
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
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
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
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
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
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
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
        setConfirmDeleteChecklist(null);
      },
      onError: (err: any) => {
        toast.error(getApiErrorMessage(err, 'Failed to delete checklist'));
      },
    });

    const addItemMutation = useMutation({
      mutationFn: async ({ checklistId, text }: { checklistId: string; text: string }) =>
        await api.post(`/cards/checklists/${checklistId}/items`, { text, position: 0 }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'checklists'] });
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
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
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
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
        await queryClient.cancelQueries({ queryKey: ['card', cardId] });
        const previous = queryClient.getQueryData(['card', cardId]);
        queryClient.setQueryData(['card', cardId], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            checklists: (old.checklists ?? []).map((cl: any) => ({
              ...cl,
              items: cl.items?.map((it: any) => (it.id === itemId ? { ...it, isDone } : it)),
            })),
          };
        });
        return { previous };
      },
      onError: (err: any, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(['card', cardId], context.previous);
        }
        toast.error(getApiErrorMessage(err, 'Failed to update checklist item'));
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      },
    });

    const deleteChecklistItemMutation = useMutation({
      mutationFn: async (itemId: string) => await api.delete(`/cards/checklist-items/${itemId}`),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'checklists'] });
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
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
    };

    const uploadAttachmentMutation = useMutation({
      mutationFn: async (file: File) => {
        const { uploadMediaFile } = await import('../../lib/api');
        const { mediaId } = await uploadMediaFile('card', cardId, file);
        return { id: mediaId, fileName: file.name } as any;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'attachments'] });
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      },
      onError: (err: any) => {
        toast.error(getApiErrorMessage(err, 'Upload failed. Please try again.'));
      },
    });

    const deleteAttachmentMutation = useMutation({
      mutationFn: async (attachmentId: string) =>
        await api.delete(`/cards/${cardId}/attachments/${attachmentId}`),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card', cardId] }),
      onError: (err: unknown) => {
        toast.error(getApiErrorMessage(err, 'Unable to delete the attachment.'));
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
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
        setIsLoggingTime(false);
        setLogHours('');
        setLogMinutes('');
        setLogDescription('');
        toast.success('Time worklog recorded');
      },
      // Previously absent: a failed worklog failed silently while the form kept
      // its values, so it looked like nothing had happened.
      onError: (err: unknown) => {
        toast.error(getApiErrorMessage(err, 'Unable to record time. Please try again.'));
      },
    });

    const deleteTimeLogMutation = useMutation({
      mutationFn: (id: string) => deleteTimeLog(id),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card', cardId] }),
      onError: (err: unknown) => {
        toast.error(getApiErrorMessage(err, 'Unable to delete the time entry.'));
      },
    });

    const quickSubtaskMutation = useMutation({
      mutationFn: async (input: { title: string; assigneeId?: string }) => {
        const res = await api.post('/cards', {
          listId: card?.listId,
          title: input.title,
          assigneeId: input.assigneeId || undefined,
          parentCardId: cardId,
        });
        return res.data;
      },
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: ['card', cardId] });
        const prev = queryClient.getQueryData<any>(['card', cardId]);
        const tempSub = {
          id: `temp-sub-${Date.now()}`,
          title: input.title,
          assignee: null,
          assignees: [],
          listName: card?.listName || 'To Do',
        };
        queryClient.setQueryData<any>(['card', cardId], (old: any) =>
          old ? { ...old, subtasks: [...(old.subtasks ?? []), tempSub] } : old
        );
        return { prev };
      },
      onError: (err, _input, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(['card', cardId], ctx.prev);
        toast.error(getApiErrorMessage(err, 'Failed to create subtask. Please try again.'));
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
        if (card?.boardId) {
          queryClient.invalidateQueries({ queryKey: ['board', 'full', card.boardId] });
        }
      },
    });

    // ─── Permission gates (handler level; button state derives from these) ──
    const { can: canPerm, isLoading: permsLoading } = usePermissions();
    const permsReady = !permsLoading;
    /**
     * Returns true when allowed. While /me is unresolved it blocks silently
     * (fail closed without a misleading toast); once resolved it shows the
     * missing-permission reason and blocks the action.
     */
    const need = (key: PermissionKey | PermissionKey[]): boolean => {
      const keys = Array.isArray(key) ? key : [key];
      if (!permsReady) return false;
      const ok = keys.some((k) => canPerm(k));
      if (!ok) toast.error(permissionReason(keys[0] as PermissionKey));
      return ok;
    };

    // Description Handlers
    const handleSaveDescription = async () => {
      if (!need('card.update')) return;
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

    useImperativeHandle(
      ref,
      () => ({
        requestClose: handleAttemptClose,
        isDirty: () => isDescDirty,
      }),
      [handleAttemptClose, isDescDirty]
    );

    // Browser unload guard
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

    const handleCopyLink = async () => {
      const url = `${window.location.origin}/cards/${cardId}`;
      // Awaited: fire-and-forget reported success even when the browser denied
      // clipboard access. The inline `copiedLink` label is the confirmation, so a
      // toast would be a duplicate.
      try {
        await navigator.clipboard.writeText(url);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } catch {
        toast.error('Unable to copy — your browser blocked clipboard access.');
      }
    };

    const handleScrollToSection = (sectionId: string) => {
      const el = document.getElementById(`section-${sectionId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    const participantUserIds = useMemo(() => {
      return card?.participants?.map((p: any) => p.id) || [];
    }, [card?.participants]);

    const uniqueMemberCount = useMemo(() => {
      const s = new Set<string>();
      if (card?.assignee?.id) s.add(card.assignee.id);
      card?.participants?.forEach((p: any) => s.add(p.id));
      card?.watchers?.forEach((w: any) => s.add(w.id));
      return Math.max(1, s.size);
    }, [card?.assignee, card?.participants, card?.watchers]);

    const systemActivities = [
      ...(card?.createdAt
        ? [
            {
              id: 'created',
              text: `Task created by ${card.creatorName || 'a teammate'}`,
              createdAt: card.createdAt,
            },
          ]
        : []),
      ...(card?.updatedAt && card?.stageName
        ? [
            {
              id: 'stage-change',
              text: `Stage set to "${card.stageName || 'In Progress'}"`,
              createdAt: card.updatedAt || new Date().toISOString(),
            },
          ]
        : []),
    ];

    const handleCloneTask = () => {
      if (!need('card.create')) return;
      setCloneMode('clone');
    };

    const handleCreateSubtask = () => {
      if (!need('card.create')) return;
      setShowSubtaskComposer(true);
    };

    const handleStartTask = async () => {
      if (!need(['card.move', 'card.update'])) return;
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
        const mins = Math.max(1, Math.round(timerSeconds / 60));
        await logCardTime(cardId, {
          minutes: mins,
          description: 'Working session timer',
          loggedDate: new Date().toISOString().split('T')[0],
          isBillable: true,
        });
        queryClient.invalidateQueries({ queryKey: ['card', cardId, 'time-logs'] });
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
        setTimerSeconds(0);
        toast.info(`Task paused. Logged ${mins} minutes.`);
      }
    };

    const handleCompleteTask = async () => {
      if (!need(['card.move', 'card.update'])) return;
      const doneList = lists.find((l: any) => /done|finish|complete|closed/i.test(l.name));
      if (doneList && doneList.id !== card?.listId) {
        await moveCardMutation.mutateAsync(doneList.id);
      }

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
        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
        setTimerSeconds(0);
      }

      toast.success('Task marked as Complete!');
    };

    // Single close path (AGENTS.md §11). Four dialogs share this scope, so each
    // gets a renamed handler. useDialogClose only registers its Escape listener
    // while `isOpen`, and these dialogs are mutually exclusive, so a single Esc
    // can never reach two of them.
    //
    // These MUST stay above the isCardLoading / !card early returns below.
    // React requires an identical hook order on every render; behind those
    // guards they were skipped while loading, so the first render that had a
    // card ran four extra hooks and React threw "Rendered more hooks than
    // during the previous render", taking down the whole page via the error
    // boundary. They depend only on useState values, so hoisting is safe.
    const { handleOpenChange: checklistDeleteClose } = useDialogClose({
      isOpen: confirmDeleteChecklist !== null,
      onClose: () => setConfirmDeleteChecklist(null),
    });

    const { handleOpenChange: archiveConfirmClose } = useDialogClose({
      isOpen: showArchiveConfirm,
      onClose: () => setShowArchiveConfirm(false),
    });

    const { handleOpenChange: deleteConfirmClose } = useDialogClose({
      isOpen: showDeleteConfirm,
      onClose: () => setShowDeleteConfirm(false),
    });

    // The unsaved-changes prompt belongs to the dirty flow: closing it returns
    // to the editor instead of discarding, so onClose clears the pending action
    // and leaves the card dialog as it was.
    const { handleOpenChange: unsavedPromptClose } = useDialogClose({
      isOpen: showUnsavedPrompt,
      onClose: () => setPendingAction(null),
    });

    if (isCardLoading) {
      return (
        <div className="flex flex-1 w-full h-full min-h-[60vh] items-center justify-center p-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-xs text-muted-foreground font-medium">Loading task workspace...</p>
          </div>
        </div>
      );
    }

    if (!card) {
      return (
        <div className="flex flex-1 w-full h-full min-h-[60vh] flex-col items-center justify-center p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground mb-3">
            ?
          </div>
          <h2 className="text-base font-bold text-foreground">Task not found</h2>
          <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-5">
            This card might have been deleted, archived, or you do not have permission to view it.
          </p>
          <div className="flex gap-2">
            {mode === 'page' ? (
              <button
                onClick={() => navigate(-1)}
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-muted"
              >
                Go back
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-muted"
              >
                Close dialog
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="relative flex flex-col w-full h-full bg-background text-foreground overflow-hidden">
        {/* Header Bar */}
        <TaskDetailHeader
          card={card}
          lists={lists}
          mode={mode}
          mobileActiveTab={mobileActiveTab}
          commentsCount={comments.length}
          copiedId={copiedId}
          copiedLink={copiedLink}
          copiedBranch={copiedBranch}
          taskIdentifier={taskIdentifier}
          isCloning={false}
          onSetMobileActiveTab={setMobileActiveTab}
          onCopyId={async () => {
            const ok = await copyTextToClipboard(taskIdentifier);
            if (ok) {
              setCopiedId(true);
              setTimeout(() => setCopiedId(false), 2000);
            }
          }}
          onCopyLink={handleCopyLink}
          onCopyBranch={async () => {
            const branch = getGitBranchName(taskIdentifier, card.title);
            await copyTextToClipboard(`git checkout -b ${branch}`);
            setCopiedBranch(true);
            setTimeout(() => setCopiedBranch(false), 2000);
            toast.success('Git branch command copied');
          }}
          onOpenShareModal={() => setShowShareModal(true)}
          onCloneTask={() => {
            if (need('card.create')) setCloneMode('clone');
          }}
          onCreateSubtask={() => {
            if (need('card.create')) setShowSubtaskComposer(true);
          }}
          onCloneAsSubtask={() => {
            if (need('card.create')) setCloneMode('subtask');
          }}
          onOpenArchiveConfirm={() => {
            if (need('card.delete')) setShowArchiveConfirm(true);
          }}
          onOpenDeleteConfirm={() => {
            if (need('card.delete')) setShowDeleteConfirm(true);
          }}
          onAttemptAction={handleAttemptAction}
          onClose={onClose}
        />

        {/* Dual-Pane Workspace */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Left Pane (60%) */}
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

            {/* Title & Description Section */}
            <TaskDescriptionCard
              cardTitle={card.title}
              cardPriority={card.priority}
              descriptionValue={descriptionValue}
              isDescDirty={isDescDirty}
              isDescExpanded={isDescExpanded}
              descTab={descTab}
              isPending={updateCardMutation.isPending}
              onUpdateTitle={(title) => {
                if (need('card.update')) updateCardMutation.mutate({ title });
              }}
              onDescriptionChange={(val) => {
                setDescriptionValue(val);
                const dirty = val !== (card?.description || '');
                setIsDescDirty(dirty);
                onDirtyChange?.(dirty);
              }}
              onSetDescTab={setDescTab}
              onSetIsDescExpanded={setIsDescExpanded}
              onSaveDescription={handleSaveDescription}
              onDiscardDescription={handleDiscardDescription}
              onInsertMarkdown={insertMarkdown}
            />

            {/* Core Metadata Grid */}
            <TaskMetadataGrid
              card={card}
              lists={lists}
              priorities={priorities}
              stageTemplates={stageTemplates}
              stagesError={stagesError}
              stagesLoading={stagesLoading}
              onRetryStages={() => void refetchStages()}
              sprints={sprints}
              phases={phases}
              orgId={orgId}
              currentUser={user}
              taskIdentifier={taskIdentifier}
              onUpdateCard={(data) => {
                if (need('card.update')) updateCardMutation.mutate(data);
              }}
              onMoveCard={(listId) => {
                if (need(['card.move', 'card.update'])) moveCardMutation.mutate(listId);
              }}
              onAssignUser={(userId) => {
                if (need('card.assign')) assignUserMutation.mutate(userId);
              }}
              onRemoveUser={(userId) => {
                if (need('card.assign')) removeUserMutation.mutate(userId);
              }}
              onAddParticipant={(userId) => {
                if (need('card.update')) addParticipantMutation.mutate(userId);
              }}
              onRemoveParticipant={(userId) => {
                if (need('card.update')) removeParticipantMutation.mutate(userId);
              }}
              onWatchCard={(userId) => {
                if (need(['card.watch', 'card.update'])) watchCardMutation.mutate(userId);
              }}
              onUnwatchCard={(userId) => {
                if (need(['card.watch', 'card.update'])) unwatchCardMutation.mutate(userId);
              }}
              onUpdateWatchers={(data) => {
                if (need(['card.watch', 'card.update'])) updateWatchersMutation.mutate(data);
              }}
              isUpdatingWatchers={updateWatchersMutation.isPending}
              onToggleLabel={(data) => {
                if (need('card.update')) toggleLabelMutation.mutate(data);
              }}
            />

            {/* Subtasks Section */}
            <TaskSubtasksCard
              card={card}
              subtasks={subtasks}
              currentUserId={user?.id}
              currentUser={user}
              orgId={orgId}
              onSelectCard={onSelectCard}
              onCreateFullSubtask={() => {
                if (need('card.create')) setShowSubtaskComposer(true);
              }}
              onQuickSubtaskSubmit={async (title, assigneeId) => {
                if (!need('card.create')) return;
                await quickSubtaskMutation.mutateAsync({ title, assigneeId });
              }}
              isSubmittingQuickSubtask={quickSubtaskMutation.isPending}
            />

            {/* Custom Fields Section */}
            <TaskCustomFieldsCard
              createdAt={card.createdAt}
              estimateMinutes={card.estimateMinutes}
            />

            {/* Git Dev Section */}
            {cardId && <GitDevSection cardId={cardId} />}

            {/* Time Tracking Section */}
            <TaskTimeTrackingCard
              timeTrackingData={timeTrackingData}
              estimateMinutes={estimateMinutes}
              totalLoggedMinutes={totalLoggedMinutes}
              timeProgressPercent={timeProgressPercent}
              isTimerRunning={isTimerRunning}
              timerSeconds={timerSeconds}
              formatTimer={formatTimer}
              isLoggingTime={isLoggingTime}
              logHours={logHours}
              logMinutes={logMinutes}
              logDate={logDate}
              logDescription={logDescription}
              logIsBillable={logIsBillable}
              isSavingLog={logTimeMutation.isPending}
              onToggleLoggingTime={() => setIsLoggingTime(!isLoggingTime)}
              onSetLogHours={setLogHours}
              onSetLogMinutes={setLogMinutes}
              onSetLogDate={setLogDate}
              onSetLogDescription={setLogDescription}
              onSetLogIsBillable={setLogIsBillable}
              onSubmitLog={() => {
                if (need('card.time_log.create')) logTimeMutation.mutate();
              }}
              onDeleteLog={(id) => {
                if (need('card.time_log.delete')) deleteTimeLogMutation.mutate(id);
              }}
            />

            {/* Checklists Section */}
            <TaskChecklistsCard
              checklists={checklists}
              onToggleItem={(itemId, isDone) => {
                if (need('card.update')) toggleItemMutation.mutate({ itemId, isDone });
              }}
              onDeleteItem={(itemId) => {
                if (need('card.update')) deleteChecklistItemMutation.mutate(itemId);
              }}
              onSaveItemOrBulk={(checklistId: string, items: string[]) => {
                if (need('card.update')) handleSaveItemOrBulk(checklistId, items);
              }}
              onUpdateChecklistTitle={(checklistId, title) => {
                if (need('card.update')) updateChecklistMutation.mutate({ checklistId, title });
              }}
              onAddChecklist={(title) => {
                if (need('card.update')) addChecklistMutation.mutate({ title });
              }}
              onRequestDeleteChecklist={(cl) => setConfirmDeleteChecklist(cl)}
              isAddingChecklist={addChecklistMutation.isPending}
            />

            {/* Attachments Section */}
            <TaskAttachmentsCard
              attachments={attachments}
              onUploadFile={(file) => {
                if (need('card.update')) uploadAttachmentMutation.mutate(file);
              }}
              onDeleteAttachment={(id) => {
                if (need('card.update')) deleteAttachmentMutation.mutate(id);
              }}
            />

            {/* Quick Navigation Ribbon */}
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

          {/* Right Pane (40% Chat) */}
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
              onAddParticipant={(userId) => {
                if (need('card.update')) addParticipantMutation.mutate(userId);
              }}
              onRemoveParticipant={(userId) => {
                if (need('card.update')) removeParticipantMutation.mutate(userId);
              }}
              onSendMessage={async (body, mentionedUserIds) => {
                if (!need('card.update')) return;
                await addCommentMutation.mutateAsync({ body, mentionedUserIds });
              }}
              onEditMessage={async (commentId, body) => {
                if (!need('card.update')) return;
                await editCommentMutation.mutateAsync({ commentId, body });
              }}
              onDeleteMessage={async (commentId) => {
                if (!need('card.update')) return;
                await deleteCommentMutation.mutateAsync(commentId);
              }}
              onUploadAttachment={async (file) => {
                if (!need('card.update')) return;
                return await uploadAttachmentMutation.mutateAsync(file);
              }}
              isSending={addCommentMutation.isPending}
            />
          </div>
        </div>

        {/* Sticky Action Bottom Bar */}
        <TaskDetailBottomBar
          isTimerRunning={isTimerRunning}
          timerSeconds={timerSeconds}
          formatTimer={formatTimer}
          onStartTask={handleStartTask}
          onCompleteTask={handleCompleteTask}
          onCloneTask={handleCloneTask}
          onCreateSubtask={handleCreateSubtask}
          onArchiveTask={() => {
            if (need('card.delete')) setShowArchiveConfirm(true);
          }}
          onDeleteTask={() => {
            if (need('card.delete')) setShowDeleteConfirm(true);
          }}
          userRating={userRating}
          onOpenRateModal={() => setShowRateModal(true)}
          uniqueMemberCount={uniqueMemberCount}
        />

        {/* Rate Task Modal */}
        <TaskRateModal
          isOpen={showRateModal}
          onClose={() => setShowRateModal(false)}
          cardId={cardId}
          userRating={userRating}
          onRatingChange={setUserRating}
        />

        {/* Full Subtask Composer Modal */}
        {showSubtaskComposer && (
          <Suspense fallback={<RouteFallback label="Loading composer…" />}>
            <CreateTaskModal
              lists={lists}
              members={[]}
              currentUser={user}
              isOpen={showSubtaskComposer}
              initialData={{ listId: card?.listId }}
              parentCardId={cardId}
              parentCardTitle={card?.title}
              boardId={card?.boardId}
              orgId={orgId}
              onClose={() => setShowSubtaskComposer(false)}
              onTaskCreated={(sub) => {
                queryClient.invalidateQueries({ queryKey: ['card', cardId] });
                setShowSubtaskComposer(false);
                if (sub?.id && onSelectCard) onSelectCard(sub.id);
              }}
            />
          </Suspense>
        )}

        {/* Review-before-clone: Clone Task / Clone & Create Subtask */}
        {cloneMode && card && (
          <CloneCardDialog
            open={!!cloneMode}
            mode={cloneMode}
            card={card}
            lists={lists}
            priorities={priorities}
            stages={(stageTemplates || []).flatMap((t: any) => t.stages || [])}
            members={[]}
            currentUser={user}
            orgId={orgId}
            parentCardId={cloneMode === 'subtask' ? cardId : undefined}
            parentCardTitle={card.title}
            onClose={() => setCloneMode(null)}
            onCloned={(cloned) => {
              queryClient.invalidateQueries({ queryKey: ['card', cardId] });
              if (card.boardId) {
                queryClient.invalidateQueries({ queryKey: ['lists', card.boardId] });
              }
              setCloneMode(null);
              if (cloned?.id) {
                if (cloneMode === 'subtask' && onSelectCard) onSelectCard(cloned.id);
                else if (!onSelectCard && mode === 'page') navigate(`/cards/${cloned.id}`);
              }
            }}
          />
        )}

        {/* Share Task Modal */}
        <ShareTaskModal
          open={showShareModal}
          onClose={() => setShowShareModal(false)}
          card={card}
        />

        {/* Delete Checklist Confirmation */}
        <ConfirmDialog
          open={!!confirmDeleteChecklist}
          onOpenChange={checklistDeleteClose}
          title="Delete checklist?"
          description={`Are you sure you want to delete "${confirmDeleteChecklist?.title || 'Checklist'}"?${
            (confirmDeleteChecklist?.itemCount || 0) > 0
              ? ` This will delete all ${confirmDeleteChecklist?.itemCount} items.`
              : ''
          }`}
          confirmLabel="Delete checklist"
          variant="destructive"
          isLoading={deleteChecklistMutation.isPending}
          onConfirm={() => {
            if (confirmDeleteChecklist?.id && need('card.update')) {
              deleteChecklistMutation.mutate(confirmDeleteChecklist.id);
            }
          }}
        />

        {/* Archive Task Confirmation */}
        <ConfirmDialog
          open={showArchiveConfirm}
          onOpenChange={archiveConfirmClose}
          title="Archive this task?"
          description={`"${card.title}" will be moved out of the active board. You can restore it anytime from archived cards.`}
          confirmLabel="Archive Task"
          isLoading={archiveCardMutation.isPending}
          onConfirm={() => {
            if (need('card.delete')) archiveCardMutation.mutate();
          }}
        />

        {/* Delete Task Confirmation */}
        <ConfirmDialog
          open={showDeleteConfirm}
          onOpenChange={deleteConfirmClose}
          title="Permanently delete task?"
          description={`Are you sure you want to delete "${card.title}"? All associated checklist items, time logs, comments, and attachments will be permanently purged. This action cannot be undone.`}
          confirmLabel="Delete Task"
          variant="destructive"
          isLoading={deleteCardMutation.isPending}
          onConfirm={() => {
            if (need('card.delete')) deleteCardMutation.mutate();
          }}
        />

        {/* Unsaved Changes Prompt */}
        <ConfirmDialog
          open={showUnsavedPrompt}
          onOpenChange={unsavedPromptClose}
          title="Unsaved requirement changes"
          description="You have unsaved changes in the task requirement. If you navigate away or close, these edits will be permanently lost."
          confirmLabel="Discard changes"
          variant="destructive"
          onConfirm={() => {
            setIsDescDirty(false);
            onDirtyChange?.(false);
            setShowUnsavedPrompt(false);
            if (pendingAction) {
              pendingAction();
              setPendingAction(null);
            }
          }}
        />
      </div>
    );
  }
);
