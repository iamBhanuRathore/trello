import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBoardForms,
  createIntakeForm,
  deleteIntakeForm,
} from '../../lib/api';
import {
  FileText,
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  Clock,
  Check,
  Globe,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@boardly/ui/dialog';

interface FormBuilderModalProps {
  boardId: string;
  lists: { id: string; name: string }[];
  isOpen: boolean;
  onClose: () => void;
}

export function FormBuilderModal({ boardId, lists, isOpen, onClose }: FormBuilderModalProps) {
  const queryClient = useQueryClient();

  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetListId, setTargetListId] = useState(lists[0]?.id || '');
  const [slaHours, setSlaHours] = useState<number | ''>(24);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ['boardForms', boardId],
    queryFn: () => getBoardForms(boardId),
    enabled: isOpen && !!boardId,
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => createIntakeForm(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boardForms', boardId] });
      setIsCreating(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteIntakeForm(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boardForms', boardId] });
    },
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setTargetListId(lists[0]?.id || '');
    setSlaHours(24);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetListId) return;

    createMutation.mutate({
      boardId,
      listId: targetListId,
      title: title.trim(),
      description: description.trim(),
      slaHours: slaHours ? Number(slaHours) : undefined,
    });
  };

  const copyShareLink = (slug: string, id: string) => {
    const url = `${window.location.origin}/forms/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">Board Intake Forms & SLAs</DialogTitle>
              <DialogDescription>
                Publish public or team intake portals that create cards automatically with SLA resolution targets.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Header Action */}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Configured Forms ({forms.length})
            </h3>
            {!isCreating && (
              <Button
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => {
                  resetForm();
                  setIsCreating(true);
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Create Intake Form
              </Button>
            )}
          </div>

          {/* Form Creator Section */}
          {isCreating ? (
            <form onSubmit={handleCreate} className="p-4 rounded-2xl border bg-muted/20 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h4 className="text-sm font-semibold">New Intake Form</h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setIsCreating(false)}
                >
                  Cancel
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-medium">Form Title</Label>
                  <Input
                    placeholder="e.g. Bug Reports, Feature Requests, IT Support"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-medium">Description / Instructions</Label>
                  <Input
                    placeholder="Instructions shown to requesters at top of portal"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Target List / Column</Label>
                  <select
                    value={targetListId}
                    onChange={(e) => setTargetListId(e.target.value)}
                    required
                    className="w-full h-9 rounded-lg border bg-background px-3 text-xs focus:ring-1 focus:ring-primary"
                  >
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Response SLA (Hours)</Label>
                  <Input
                    type="number"
                    placeholder="24"
                    value={slaHours}
                    onChange={(e) => setSlaHours(e.target.value === '' ? '' : Number(e.target.value))}
                    className="text-xs h-9"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  type="submit"
                  size="sm"
                  disabled={createMutation.isPending || !title.trim()}
                  className="h-8 text-xs gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> Save &amp; Publish Form
                </Button>
              </div>
            </form>
          ) : null}

          {/* Forms List */}
          {isLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Loading forms...</div>
          ) : forms.length > 0 ? (
            <div className="space-y-3">
              {forms.map((form: any) => (
                <div
                  key={form.id}
                  className="p-4 rounded-2xl border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-primary/30 transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm">{form.title}</h4>
                      {form.slaHours && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {form.slaHours}h SLA
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          form.isPublished
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {form.isPublished ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Target list: <span className="font-medium text-foreground">{form.listName}</span> •{' '}
                      {form.submissionCount} submissions received
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      onClick={() => copyShareLink(form.slug, form.id)}
                    >
                      {copiedId === form.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Share Link
                        </>
                      )}
                    </Button>

                    <a
                      href={`/forms/${form.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Open public portal"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-rose-500"
                      onClick={() => deleteMutation.mutate(form.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground border rounded-2xl bg-muted/10 space-y-2">
              <Globe className="w-6 h-6 mx-auto text-muted-foreground/40" />
              <p className="font-medium">No intake forms created for this board.</p>
              <p className="text-[11px]">
                Create a form to accept external requests, customer tickets, or bug reports with automated SLA due dates.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
