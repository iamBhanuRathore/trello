import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { stagesService } from '../../lib/stagesService';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boardly/ui/select';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { QueryError } from '../../components/common/QueryError';

const CATEGORIES = ['not_started', 'in_progress', 'blocked', 'done'] as const;
const PRESET_COLORS = ['#94a3b8', '#3b82f6', '#eab308', '#22c55e', '#ef4444', '#a855f7'];

export const StageTemplates = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const orgId = user?.organizationId;

  const [newTemplateName, setNewTemplateName] = useState('');
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  const {
    data: templates,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['stageTemplates', orgId],
    queryFn: () => stagesService.getTemplates(orgId!),
    enabled: !!orgId,
  });

  const {
    data: templateDetails,
    isLoading: detailsLoading,
    isError: isDetailsError,
    refetch: refetchDetails,
  } = useQuery({
    queryKey: ['stageTemplate', activeTemplate],
    queryFn: () => stagesService.getTemplate(activeTemplate!),
    enabled: !!activeTemplate,
  });

  const createTemplateMutation = useMutation({
    mutationFn: (name: string) => stagesService.createTemplate(orgId!, { name }),
    onSuccess: (newTemplate) => {
      queryClient.invalidateQueries({ queryKey: ['stageTemplates', orgId] });
      setNewTemplateName('');
      setActiveTemplate(newTemplate.id);
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => stagesService.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stageTemplates', orgId] });
      setActiveTemplate(null);
    },
  });

  const addStageMutation = useMutation({
    mutationFn: (data: any) => stagesService.createStage(activeTemplate!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stageTemplate', activeTemplate] });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: (data: { id: string; payload: any }) =>
      stagesService.updateStage(data.id, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stageTemplate', activeTemplate] });
    },
  });

  const deleteStageMutation = useMutation({
    mutationFn: (id: string) => stagesService.deleteStage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stageTemplate', activeTemplate] });
    },
  });

  const handleCreateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;
    createTemplateMutation.mutate(newTemplateName);
  };

  const handleAddStage = () => {
    if (!templateDetails) return;
    const position = templateDetails.stages.length * 65536 + 65536;
    addStageMutation.mutate({
      name: 'New Stage',
      color: '#94a3b8',
      position,
      category: 'not_started',
    });
  };

  const handleUpdateStage = (id: string, field: string, value: any) => {
    updateStageMutation.mutate({ id, payload: { [field]: value } });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Stage Templates</h1>
        <p className="text-muted-foreground mt-1">
          Manage semantic stages for your organization's projects.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 border rounded-xl p-4 bg-card text-card-foreground shadow-xs space-y-4">
          <h2 className="font-semibold text-foreground">Templates</h2>

          <form onSubmit={handleCreateTemplate} className="flex gap-2">
            <Input
              placeholder="New Template..."
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              maxLength={100}
              className="h-8"
            />
            <Button type="submit" size="sm" className="h-8">
              <Plus className="h-4 w-4" />
            </Button>
          </form>

          <div className="space-y-1.5 pt-2">
            {isLoading && !templates ? (
              <div className="space-y-1.5" aria-label="Loading templates">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-11 rounded-lg bg-muted/60 animate-pulse" />
                ))}
              </div>
            ) : isError && !templates ? (
              <QueryError compact message="Couldn't load templates." onRetry={() => refetch()} />
            ) : templates?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No templates yet.</p>
            ) : (
              templates?.map((t: any) => (
                <div
                  key={t.id}
                  className={`flex justify-between items-center p-2.5 rounded-lg cursor-pointer transition-colors ${activeTemplate === t.id ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-muted text-foreground'}`}
                  onClick={() => setActiveTemplate(t.id)}
                >
                  <span className="truncate text-sm">{t.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive opacity-50 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTemplateMutation.mutate(t.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="md:col-span-2 border rounded-xl p-6 bg-card text-card-foreground shadow-xs">
          {!activeTemplate ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Select a template to view or edit stages
            </div>
          ) : detailsLoading && !templateDetails ? (
            <div className="space-y-4" aria-label="Loading template details">
              <div className="h-7 w-48 rounded-lg bg-muted animate-pulse" />
              <div className="h-24 rounded-xl bg-muted/60 animate-pulse" />
            </div>
          ) : isDetailsError && !templateDetails ? (
            <QueryError
              message="Couldn't load template details."
              onRetry={() => refetchDetails()}
            />
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-foreground">{templateDetails?.name}</h2>
                <Button onClick={handleAddStage} size="sm">
                  <Plus className="h-4 w-4 mr-2" /> Add Stage
                </Button>
              </div>

              <div className="space-y-3">
                {templateDetails?.stages?.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No stages defined yet.</p>
                ) : (
                  templateDetails?.stages?.map((stage: any) => (
                    <div
                      key={stage.id}
                      className="flex items-center gap-3 p-3 border rounded-lg bg-muted/40 group"
                    >
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab active:cursor-grabbing" />

                      <div className="flex gap-1.5">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            className={`w-5 h-5 rounded-full border-2 ${stage.color === c ? 'border-primary ring-2 ring-primary/30' : 'border-transparent'}`}
                            style={{ backgroundColor: c }}
                            onClick={() => handleUpdateStage(stage.id, 'color', c)}
                          />
                        ))}
                      </div>

                      <Input
                        value={stage.name}
                        maxLength={100}
                        placeholder="Stage name..."
                        onChange={(e) => {
                          handleUpdateStage(stage.id, 'name', e.target.value);
                        }}
                        className="flex-1 ml-2 bg-background"
                      />

                      <Select
                        value={stage.category}
                        onValueChange={(v) => handleUpdateStage(stage.id, 'category', v)}
                      >
                        <SelectTrigger size="sm" className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat.replace('_', ' ').toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteStageMutation.mutate(stage.id)}
                        className="text-destructive opacity-50 group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
