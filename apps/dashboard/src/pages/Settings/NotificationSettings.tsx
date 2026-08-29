import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { getNotificationPreferences, updateNotificationPreferences } from '../../lib/api';
import { Button } from '@boardly/ui/button';
import { Switch } from '@boardly/ui/switch';
import { toast } from 'sonner';

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
    try {
      const prefs = await getNotificationPreferences();
      setPreferences(prefs);
      
      // Attempt to load DND hours from first preference that has it
      const dndPref = prefs.find((p: any) => p.quietHoursStart !== null && p.quietHoursStart !== undefined);
      if (dndPref) {
        setDndEnabled(true);
        setQuietHoursStart(dndPref.quietHoursStart);
        setQuietHoursEnd(dndPref.quietHoursEnd);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getPrefFrequency = (eventId: string, channelId: string) => {
    const pref = preferences.find(p => p.eventType === eventId && p.channel === channelId);
    return pref?.frequency || 'instant';
  };

  const setPrefFrequency = (eventId: string, channelId: string, frequency: string) => {
    setPreferences(prev => {
      const filtered = prev.filter(p => !(p.eventType === eventId && p.channel === channelId));
      return [...filtered, { eventType: eventId, channel: channelId, frequency, quietHoursStart, quietHoursEnd }];
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
    } catch (err) {
      console.error(err);
      toast.error('Failed to save notification preferences.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8">Loading settings...</div>;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Notification Settings</h1>
      
      <div className="bg-card rounded-lg border p-6 mb-8 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Do Not Disturb (Quiet Hours)</h2>
        <p className="text-muted-foreground mb-4">
          Pause instant email and push notifications during these hours. In-app notifications will still be delivered.
        </p>
        
        <div className="flex items-center gap-4 mb-4">
          <Switch 
            checked={dndEnabled} 
            onCheckedChange={setDndEnabled} 
            id="dnd-mode" 
          />
          <label htmlFor="dnd-mode" className="font-medium cursor-pointer">Enable Quiet Hours</label>
        </div>

        {dndEnabled && (
          <div className="flex items-center gap-4 mt-4 bg-muted/30 p-4 rounded-md">
            <div>
              <label className="block text-sm mb-1 font-medium">Start Time (24h)</label>
              <input 
                type="number" 
                min="0" max="23"
                value={quietHoursStart}
                onChange={e => setQuietHoursStart(Number(e.target.value))}
                className="flex h-10 w-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <span className="mt-6 text-muted-foreground">to</span>
            <div>
              <label className="block text-sm mb-1 font-medium">End Time (24h)</label>
              <input 
                type="number" 
                min="0" max="23"
                value={quietHoursEnd}
                onChange={e => setQuietHoursEnd(Number(e.target.value))}
                className="flex h-10 w-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">Notification Types</h2>
          <p className="text-sm text-muted-foreground mt-1">Choose how and when you want to be notified.</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Event</th>
                {CHANNELS.map(c => (
                  <th key={c.id} className="px-6 py-4 font-medium">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVENTS.map(event => (
                <tr key={event.id} className="border-b last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="px-6 py-4 font-medium">{event.label}</td>
                  {CHANNELS.map(channel => (
                    <td key={channel.id} className="px-6 py-4">
                      {channel.id === 'in_app' ? (
                        <select 
                          className="flex h-9 w-[130px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          value={getPrefFrequency(event.id, channel.id)}
                          onChange={e => setPrefFrequency(event.id, channel.id, e.target.value)}
                        >
                          <option value="instant">Instant</option>
                          <option value="off">Off</option>
                        </select>
                      ) : (
                        <select 
                          className="flex h-9 w-[130px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          value={getPrefFrequency(event.id, channel.id)}
                          onChange={e => setPrefFrequency(event.id, channel.id, e.target.value)}
                        >
                          {FREQUENCIES.map(f => (
                            <option key={f.id} value={f.id}>{f.label}</option>
                          ))}
                        </select>
                      )}
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
