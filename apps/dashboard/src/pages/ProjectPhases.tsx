import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { phasesService } from '../lib/phasesService';
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
import { Calendar, ArrowLeft, Flag, GitBranch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@boardly/ui/card';
import { api } from '../lib/api';

export const ProjectPhases = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();

  const { data: phases, isLoading } = useQuery({
    queryKey: ['phases', projectId],
    queryFn: () => phasesService.getPhases(projectId!),
    enabled: !!projectId,
  });

  const updatePhaseMutation = useMutation({
    mutationFn: (data: { id: string; status: string }) =>
      phasesService.updatePhase(data.id, { status: data.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['phases', projectId] }),
  });

  if (isLoading) return <div className="p-8">Loading phases...</div>;

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-8 py-8">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Phase Planner</h1>
        </div>
        <CreatePhaseDialog
          projectId={projectId!}
          nextPosition={phases?.length ? phases.length + 1 : 1}
        />
      </div>

      <div className="grid gap-6">
        {phases?.length === 0 ? (
          <div className="text-center py-12 bg-muted/20 border rounded-lg">
            <GitBranch className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No phases defined</h3>
            <p className="text-muted-foreground mb-4">
              Create phases to structure your project lifecycle.
            </p>
            <CreatePhaseDialog projectId={projectId!} nextPosition={1} />
          </div>
        ) : (
          <div className="space-y-6">
            {phases?.map((phase: any, index: number) => (
              <div key={phase.id} className="relative pl-8">
                {/* Timeline connector */}
                {index !== phases.length - 1 && (
                  <div className="absolute left-3 top-8 bottom-[-24px] w-0.5 bg-border z-0"></div>
                )}

                {/* Timeline node */}
                <div
                  className={`absolute left-1.5 top-5 w-3.5 h-3.5 rounded-full z-10 border-2 ${
                    phase.status === 'completed'
                      ? 'bg-primary border-primary'
                      : phase.status === 'active'
                        ? 'bg-background border-primary'
                        : 'bg-background border-muted-foreground'
                  }`}
                ></div>

                <PhaseCard
                  phase={phase}
                  onUpdateStatus={(status) => updatePhaseMutation.mutate({ id: phase.id, status })}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function PhaseCard({ phase, onUpdateStatus }: { phase: any; onUpdateStatus: (s: string) => void }) {
  // Fetch cards for this phase
  const { data: phaseCards } = useQuery({
    queryKey: ['phaseCards', phase.id],
    queryFn: () => phasesService.getPhaseCards(phase.id),
  });

  return (
    <Card
      className={`shadow-sm transition-all ${phase.status === 'completed' ? 'opacity-75' : ''}`}
    >
      <CardHeader className="pb-3 border-b bg-muted/10">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase bg-muted px-2 py-0.5 rounded">
              Phase {phase.position}
            </span>
            <CardTitle className="text-lg">{phase.name}</CardTitle>
          </div>
          <div>
            {phase.status === 'not_started' && (
              <Button size="sm" onClick={() => onUpdateStatus('active')}>
                Start Phase
              </Button>
            )}
            {phase.status === 'active' && (
              <Button size="sm" variant="secondary" onClick={() => onUpdateStatus('completed')}>
                Complete
              </Button>
            )}
            {phase.status === 'completed' && (
              <span className="text-sm font-medium text-primary">Completed</span>
            )}
          </div>
        </div>
        {(phase.startDate || phase.endDate) && (
          <div className="text-sm text-muted-foreground flex gap-4 mt-2">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {phase.startDate ? format(new Date(phase.startDate), 'MMM d, yyyy') : 'TBD'} -{' '}
              {phase.endDate ? format(new Date(phase.endDate), 'MMM d, yyyy') : 'TBD'}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <Flag className="h-3 w-3" /> Cards in Phase ({phaseCards?.length || 0})
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {phaseCards?.length === 0 ? (
              <p className="text-sm text-muted-foreground italic col-span-full">
                No cards added to this phase yet.
              </p>
            ) : (
              phaseCards?.map((cp: any) => <PhaseCardItem key={cp.cardId} cardId={cp.cardId} />)
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PhaseCardItem({ cardId }: { cardId: string }) {
  const { data: card } = useQuery({
    queryKey: ['card', cardId],
    queryFn: async () => (await api.get(`/cards/${cardId}`)).data,
  });

  if (!card) return <div className="h-8 bg-muted/50 rounded animate-pulse w-full"></div>;
  return (
    <Link to={`/b/${card.list?.boardId}?card=${card.id}`} className="block hover:border-primary">
      <div className="text-sm truncate p-2 border rounded-lg bg-card shadow-xs transition-colors">
        {card.title}
      </div>
    </Link>
  );
}

function CreatePhaseDialog({
  projectId,
  nextPosition,
}: {
  projectId: string;
  nextPosition: number;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: 'Discovery',
    position: nextPosition,
    startDate: '',
    endDate: '',
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => phasesService.createPhase(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phases', projectId] });
      setOpen(false);
      setFormData({ ...formData, name: '', position: nextPosition + 1 });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      startDate: formData.startDate || undefined,
      endDate: formData.endDate || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Phase</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Define New Phase</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Phase Name</Label>
            <Input
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Design, Development..."
            />
          </div>
          <div className="grid gap-2">
            <Label>Position (Order)</Label>
            <Input
              type="number"
              required
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: parseInt(e.target.value) })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Start Date (Optional)</Label>
              <DatePicker
                value={formData.startDate}
                onChange={(v) => setFormData({ ...formData, startDate: v })}
                placeholder="Select start date"
              />
            </div>
            <div className="grid gap-2">
              <Label>End Date (Optional)</Label>
              <DatePicker
                value={formData.endDate}
                onChange={(v) => setFormData({ ...formData, endDate: v })}
                placeholder="Select end date"
                min={formData.startDate || undefined}
              />
            </div>
          </div>
          <Button type="submit" className="mt-2" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Phase'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
