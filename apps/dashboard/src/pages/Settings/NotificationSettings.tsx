import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { getNotificationPreferences, updateNotificationPreferences } from '../../lib/api';
import { Button } from '@boardly/ui/button';
import { Switch } from '@boardly/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boardly/ui/select';
import { toast } from 'sonner';
import { QueryError } from '../../components/common/QueryError';

const EVENTS = [
  { id: 'card.assigned', label: 'Card Assigned' },
  { id: 'card.commented', label: 'Card Commented' },
];

const CHANNELS = [
  { id: 'in_app', label: 'In-App' },
  { id: 'email', label: 'Email' },
];

const FREQUENCIES = [
  { id: 'instant', label: 'Instant' },
  { id: 'digest_daily', label: 'Daily Digest' },
  { id: 'digest_weekly', label: 'Weekly Digest' },
  { id: 'off', label: 'Off' },
];

export function NotificationSettings() {
  const { user } = useAuthStore();
  const [preferences, setPreferences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Global DND toggle state (simplified for UI)
  const [dndEnabled, setDndEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState(22);
  const [quietHoursEnd, setQuietHoursEnd] = useState(8);

  useEffect(() => {
    if (user) {
      loadPreferences();
    }
  }, [user]);

  const loadPreferences = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const prefs = await getNotificationPreferences();
      setPreferences(prefs);

      // Attempt to load DND hours from first preference that has it
      const dndPref = prefs.find(
        (p: any) => p.quietHoursStart !== null && p.quietHoursStart !== undefined
      );
      if (dndPref) {
        setDndEnabled(true);
        setQuietHoursStart(dndPref.quietHoursStart);
        setQuietHoursEnd(dndPref.quietHoursEnd);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const getPrefFrequency = (eventId: string, channelId: string) => {
    const pref = preferences.find((p) => p.eventType === eventId && p.channel === channelId);
    return pref?.frequency || 'instant';
  };

  const setPrefFrequency = (eventId: string, channelId: string, frequency: string) => {
    setPreferences((prev) => {
      const filtered = prev.filter((p) => !(p.eventType === eventId && p.channel === channelId));
      return [
        ...filtered,
        { eventType: eventId, channel: channelId, frequency, quietHoursStart, quietHoursEnd },
      ];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build flattened array of preferences for update
      const payload: any[] = [];
      for (const event of EVENTS) {
        for (const channel of CHANNELS) {
          const freq = getPrefFrequency(event.id, channel.id);
          payload.push({
            eventType: event.id,
            channel: channel.id,
            frequency: freq,
            quietHoursStart: dndEnabled ? quietHoursStart : null,
            quietHoursEnd: dndEnabled ? quietHoursEnd : null,
          });
        }
      }
      await updateNotificationPreferences(payload);
      toast.success('Notification preferences saved successfully!');
    } catch {
      toast.error('Failed to save notification preferences.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        className="max-w-4xl mx-auto py-8 px-4 space-y-8"
        aria-label="Loading notification settings"
      >
        <div className="h-9 w-72 rounded-lg bg-muted animate-pulse" />
        <div className="rounded-lg border bg-card/40 p-6 space-y-4">
          <div className="h-6 w-64 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-full rounded bg-muted/60 animate-pulse" />
          <div className="h-5 w-48 rounded bg-muted/70 animate-pulse" />
        </div>
        <div className="rounded-lg border bg-card/40 overflow-hidden">
          <div className="p-6 border-b space-y-2">
            <div className="h-6 w-56 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-80 max-w-full rounded bg-muted/60 animate-pulse" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[68px] border-b last:border-0 px-6 py-4" />
          ))}
        </div>
        {/* Save row reserve */}
        <div className="mt-8 flex justify-end">
          <div className="h-11 w-40 rounded-lg bg-muted/70 animate-pulse" />
        </div>
      </div>
    );
  }

  // Never render the form on a failed fetch — the dropdowns fall back to
  // 'instant' defaults and saving would overwrite the real preferences.
  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <QueryError
          message="Couldn't load notification preferences. Your settings were left untouched."
          onRetry={() => loadPreferences()}
          className="min-h-[50vh]"
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Notification Settings</h1>

      <div className="bg-card rounded-lg border p-6 mb-8 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Do Not Disturb (Quiet Hours)</h2>
        <p className="text-muted-foreground mb-4">
          Pause instant email and push notifications during these hours. In-app notifications will
          still be delivered.
        </p>

        <div className="flex items-center gap-4 mb-4">
          <Switch checked={dndEnabled} onCheckedChange={setDndEnabled} id="dnd-mode" />
          <label htmlFor="dnd-mode" className="font-medium cursor-pointer">
            Enable Quiet Hours
          </label>
        </div>

        {dndEnabled && (
          <div className="flex items-center gap-4 mt-4 bg-muted/30 p-4 rounded-md">
            <div>
              <label className="block text-sm mb-1 font-medium">Start Time (24h)</label>
              <input
                type="number"
                min="0"
                max="23"
                value={quietHoursStart}
                onChange={(e) => setQuietHoursStart(Number(e.target.value))}
                className="flex h-10 w-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <span className="mt-6 text-muted-foreground">to</span>
            <div>
              <label className="block text-sm mb-1 font-medium">End Time (24h)</label>
              <input
                type="number"
                min="0"
                max="23"
                value={quietHoursEnd}
                onChange={(e) => setQuietHoursEnd(Number(e.target.value))}
                className="flex h-10 w-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">Notification Types</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose how and when you want to be notified.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Event</th>
                {CHANNELS.map((c) => (
                  <th key={c.id} className="px-6 py-4 font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVENTS.map((event) => (
                <tr
                  key={event.id}
                  className="border-b last:border-0 hover:bg-muted/10 transition-colors"
                >
                  <td className="px-6 py-4 font-medium">{event.label}</td>
                  {CHANNELS.map((channel) => (
                    <td key={channel.id} className="px-6 py-4">
                      <Select
                        value={getPrefFrequency(event.id, channel.id)}
                        onValueChange={(v) => setPrefFrequency(event.id, channel.id, v)}
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {channel.id === 'in_app' ? (
                            <>
                              <SelectItem value="instant">Instant</SelectItem>
                              <SelectItem value="off">Off</SelectItem>
                            </>
                          ) : (
                            FREQUENCIES.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.label}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>
    </div>
  );
}
