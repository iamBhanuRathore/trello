import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import { getWebhooks, createWebhook, updateWebhook, deleteWebhook } from '../../lib/api';
import { Button } from '@boardly/ui/button';
import { Switch } from '@boardly/ui/switch';
import { Trash, Plus, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

const AVAILABLE_EVENTS = [
  { id: 'card.created', label: 'Card Created' },
  { id: 'card.updated', label: 'Card Updated' },
  { id: 'card.moved', label: 'Card Moved' },
  { id: 'card.archived', label: 'Card Archived' },
  { id: 'card.commented', label: 'Card Commented' },
  { id: 'card.assigned', label: 'Card Assigned' },
  { id: 'card.labeled', label: 'Card Labeled' },
];

export function WebhookSettings() {
  const user = useAuthStore((state) => state.user);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New webhook form
  const [isAdding, setIsAdding] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [webhookToDelete, setWebhookToDelete] = useState<{ id: string; url: string } | null>(null);

  // UI state
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});

  const loadWebhooks = useCallback(async () => {
    if (!user?.organizationId) return;
    try {
      const data = await getWebhooks(user.organizationId);
      setWebhooks(data);
    } catch {
      toast.error('Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }, [user?.organizationId]);

  useEffect(() => {
    if (user?.organizationId) {
      loadWebhooks();
    }
  }, [user?.organizationId, loadWebhooks]);

  const handleCreate = async () => {
    if (!newUrl) return;
    try {
      await createWebhook(user!.organizationId, {
        url: newUrl,
        events: newEvents.length > 0 ? newEvents : ['*'],
      });
      setNewUrl('');
      setNewEvents([]);
      setIsAdding(false);
      loadWebhooks();
      toast.success('Webhook created successfully');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create webhook');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWebhook(user!.organizationId, id);
      setWebhookToDelete(null);
      loadWebhooks();
      toast.success('Webhook deleted successfully');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete webhook');
    }
  };

  const handleToggleEvent = (eventId: string) => {
    setNewEvents((prev) =>
      prev.includes(eventId) ? prev.filter((e) => e !== eventId) : [...prev, eventId]
    );
  };

  const toggleStatus = async (id: string, isEnabled: boolean) => {
    try {
      await updateWebhook(user!.organizationId, id, { isEnabled });
      loadWebhooks();
    } catch {
      toast.error('Failed to update webhook');
    }
  };

  const toggleSecret = (id: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4" aria-busy={loading}>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Webhooks</h1>
        <Button onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? (
            'Cancel'
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" /> Add Webhook
            </>
          )}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4 min-h-[50vh]" aria-label="Loading webhooks">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-4 w-56 rounded bg-muted animate-pulse" />
                <div className="h-5 w-10 rounded-full bg-muted/70 animate-pulse" />
              </div>
              <div className="h-3 w-3/4 rounded bg-muted/60 animate-pulse" />
              <div className="flex gap-2">
                <div className="h-6 w-20 rounded-md bg-muted/60 animate-pulse" />
                <div className="h-6 w-20 rounded-md bg-muted/60 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {isAdding && (
            <div className="bg-card rounded-lg border p-6 mb-8 shadow-sm">
              <h2 className="text-xl font-semibold mb-4">New Webhook</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Payload URL</label>
                  <input
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://example.com/webhook"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Events to send</label>
                  <div className="grid grid-cols-2 gap-2 bg-muted/30 p-4 rounded-md">
                    {AVAILABLE_EVENTS.map((ev) => (
                      <label key={ev.id} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={newEvents.includes(ev.id)}
                          onChange={() => handleToggleEvent(ev.id)}
                          className="rounded border-gray-300"
                        />
                        {ev.label}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Leave all unchecked to send all events ('*').
                  </p>
                </div>

                <div className="pt-2">
                  <Button onClick={handleCreate} disabled={!newUrl}>
                    Create Webhook
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4 min-h-[50vh] flex flex-col">
            {webhooks.length === 0 && !isAdding ? (
              <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed bg-muted/20 p-12 text-center">
                <p className="text-muted-foreground">
                  No webhooks configured for this organization.
                </p>
              </div>
            ) : (
              webhooks.map((hook) => (
                <div
                  key={hook.id}
                  className="bg-card rounded-lg border p-5 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-start"
                >
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${hook.isEnabled ? 'bg-green-500' : 'bg-gray-400'}`}
                      ></span>
                      <h3 className="font-semibold truncate max-w-[300px]" title={hook.url}>
                        {hook.url}
                      </h3>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase mb-1">
                        Events
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {hook.events.includes('*') || hook.events.length === 0 ? (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            All Events
                          </span>
                        ) : (
                          hook.events.map((e: string) => (
                            <span
                              key={e}
                              className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full"
                            >
                              {e}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase mb-1">
                        Secret (HMAC-SHA256)
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded w-64 truncate">
                          {revealedSecrets[hook.id]
                            ? hook.secret
                            : '••••••••••••••••••••••••••••••••'}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => toggleSecret(hook.id)}
                        >
                          {revealedSecrets[hook.id] ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 border-t md:border-t-0 pt-4 md:pt-0 w-full md:w-auto">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={hook.isEnabled}
                        onCheckedChange={(c) => toggleStatus(hook.id, c)}
                        id={`status-${hook.id}`}
                      />
                      <label
                        htmlFor={`status-${hook.id}`}
                        className="text-sm font-medium text-muted-foreground"
                      >
                        {hook.isEnabled ? 'Active' : 'Disabled'}
                      </label>
                    </div>
                    <div className="h-8 w-px bg-border hidden md:block"></div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                      title="Delete Webhook"
                      onClick={() => setWebhookToDelete({ id: hook.id, url: hook.url })}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Delete Webhook Confirmation Dialog */}
          <ConfirmDialog
            open={!!webhookToDelete}
            onOpenChange={(open) => {
              if (!open) setWebhookToDelete(null);
            }}
            title="Delete Webhook"
            description={`Are you sure you want to delete the webhook "${webhookToDelete?.url || ''}"? This organization will stop receiving event notifications to this URL.`}
            confirmLabel="Delete Webhook"
            variant="destructive"
            onConfirm={() => {
              if (webhookToDelete) {
                handleDelete(webhookToDelete.id);
              }
            }}
          />
        </>
      )}
    </div>
  );
}
