import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sprintsService } from '../lib/sprintsService';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@boardly/ui/dialog';
import { DatePicker } from '@boardly/ui';
import { format } from 'date-fns';
import { Calendar, Target, Flag, ArrowLeft, Play, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@boardly/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boardly/ui/select';
import { api } from '../lib/api';
import { QueryError } from '../components/common/QueryError';

export const ProjectSprints = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();

  const {
    data: sprints = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['sprints', projectId],
    queryFn: () => sprintsService.getSprints(projectId!),
    enabled: !!projectId,
  });

  const updateSprintMutation = useMutation({
    mutationFn: (data: { id: string; status: string }) =>
      sprintsService.updateSprint(data.id, { status: data.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sprints', projectId] }),
  });

  if (isError && sprints.length === 0)
    return (
      <div className="w-full max-w-6xl mx-auto py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              to="/"
              className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">Sprint Planner</h1>
          </div>
          <CreateSprintDialog projectId={projectId!} />
        </div>
        <QueryError
          message="Couldn't load sprints. Check your connection and try again."
          onRetry={() => refetch()}
          className="min-h-[50vh]"
        />
      </div>
    );

  const activeSprints = sprints?.filter((s: any) => s.status === 'active') || [];
  const plannedSprints = sprints?.filter((s: any) => s.status === 'planned') || [];
  const completedSprints = sprints?.filter((s: any) => s.status === 'completed') || [];
  const showLoading = isLoading && sprints.length === 0;

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-8 py-8" aria-busy={showLoading}>
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Sprint Planner</h1>
        </div>
        <CreateSprintDialog projectId={projectId!} />
      </div>

      {showLoading ? (
        <div className="flex flex-col gap-8" aria-label="Loading sprints">
          {['Active Sprints', 'Planned Sprints', 'Completed Sprints'].map((section) => (
            <div key={section} className="space-y-4">
              <div className="h-7 w-48 rounded-lg bg-muted animate-pulse" />
              <div className="grid gap-4 md:grid-cols-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-44 rounded-2xl border bg-card/40 animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {activeSprints.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2 text-primary">
                <Play className="h-5 w-5" /> Active Sprints
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {activeSprints.map((sprint: any) => (
                  <SprintCard
                    key={sprint.id}
                    sprint={sprint}
                    onUpdateStatus={(status) =>
                      updateSprintMutation.mutate({ id: sprint.id, status })
                    }
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Calendar className="h-5 w-5" /> Planned Sprints
            </h2>
            {plannedSprints.length === 0 && (
              <p className="text-muted-foreground">No planned sprints.</p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {plannedSprints.map((sprint: any) => (
                <SprintCard
                  key={sprint.id}
                  sprint={sprint}
                  onUpdateStatus={(status) =>
                    updateSprintMutation.mutate({ id: sprint.id, status })
                  }
                />
              ))}
            </div>
          </div>

          {completedSprints.length > 0 && (
            <div className="space-y-4 opacity-75">
              <h2 className="text-xl font-bold flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-5 w-5" /> Completed Sprints
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {completedSprints.map((sprint: any) => (
                  <SprintCard key={sprint.id} sprint={sprint} readOnly />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

function SprintCard({
  sprint,
  onUpdateStatus,
  readOnly = false,
}: {
  sprint: any;
  onUpdateStatus?: (s: string) => void;
  readOnly?: boolean;
}) {
  // Fetch cards for this sprint
  const {
    data: sprintCards,
    isLoading: isCardsLoading,
    isError: isCardsError,
  } = useQuery({
    queryKey: ['sprintCards', sprint.id],
    queryFn: () => sprintsService.getSprintCards(sprint.id),
  });

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3 border-b bg-muted/20">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">{sprint.name}</CardTitle>
          {!readOnly && (
            <div>
              {sprint.status === 'planned' && (
                <Button size="sm" onClick={() => onUpdateStatus?.('active')}>
                  Start Sprint
                </Button>
              )}
              {sprint.status === 'active' && (
                <Button size="sm" variant="secondary" onClick={() => onUpdateStatus?.('completed')}>
                  Complete
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="text-sm text-muted-foreground flex gap-4 mt-2">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {format(new Date(sprint.startDate), 'MMM d')} -{' '}
            {format(new Date(sprint.endDate), 'MMM d, yyyy')}
          </span>
          <span className="capitalize">{sprint.type}</span>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {sprint.goal && (
          <div className="text-sm bg-primary/5 p-3 rounded-md border border-primary/10 flex gap-2">
            <Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-primary/90">{sprint.goal}</p>
          </div>
        )}

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <Flag className="h-3 w-3" /> Cards in Sprint ({sprintCards?.length || 0})
          </h4>
          <div className="space-y-1">
            {isCardsLoading && !sprintCards ? (
              <div className="space-y-1" aria-label="Loading cards">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-6 bg-muted/50 rounded animate-pulse w-full" />
                ))}
              </div>
            ) : isCardsError && !sprintCards ? (
              <p className="text-xs text-muted-foreground italic">
                Couldn&apos;t load sprint cards.
              </p>
            ) : sprintCards?.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No cards added to this sprint yet.
              </p>
            ) : (
              sprintCards
                ?.slice(0, 5)
                .map((cs: any) => <SprintCardItem key={cs.cardId} cardId={cs.cardId} />)
            )}
            {sprintCards && sprintCards.length > 5 && (
              <p className="text-xs text-muted-foreground mt-2">
                ...and {sprintCards.length - 5} more cards
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SprintCardItem({ cardId }: { cardId: string }) {
  const { data: card, isError } = useQuery({
    queryKey: ['card', cardId],
    queryFn: async () => (await api.get(`/cards/${cardId}`)).data,
  });

  if (isError)
    return (
      <div className="text-xs text-muted-foreground italic p-1.5">Couldn&apos;t load card.</div>
    );
  if (!card) return <div className="h-6 bg-muted/50 rounded animate-pulse w-full"></div>;
  return (
    <div className="text-sm truncate p-1.5 border rounded bg-card shadow-xs">{card.title}</div>
  );
}

function CreateSprintDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: 'Sprint 1',
    type: 'biweekly',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    goal: '',
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => sprintsService.createSprint(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', projectId] });
      setOpen(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create Sprint</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Plan New Sprint</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Sprint Name</Label>
            <Input
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label>Sprint Type</Label>
            <Select
              value={formData.type}
              onValueChange={(v) => setFormData({ ...formData, type: v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Biweekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Start Date</Label>
              <DatePicker
                required
                value={formData.startDate}
                onChange={(v) => setFormData({ ...formData, startDate: v })}
                placeholder="Select start date"
              />
            </div>
            <div className="grid gap-2">
              <Label>End Date</Label>
              <DatePicker
                required
                value={formData.endDate}
                onChange={(v) => setFormData({ ...formData, endDate: v })}
                placeholder="Select end date"
                min={formData.startDate || undefined}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Sprint Goal (Optional)</Label>
            <Input
              value={formData.goal}
              onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
              placeholder="Deliver feature X..."
            />
          </div>
          <Button
            type="submit"
            className="mt-2"
            disabled={createMutation.isPending || !formData.startDate || !formData.endDate}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Sprint'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
