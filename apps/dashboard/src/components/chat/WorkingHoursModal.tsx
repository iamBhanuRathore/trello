import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Globe, X, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { presenceService } from '../../lib/presenceService';
import { PresenceBadge } from './PresenceBadge';
import { useDialogClose } from '../../hooks/useDialogClose';

interface WorkingHoursModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const WorkingHoursModal: React.FC<WorkingHoursModalProps> = ({ isOpen, onClose }) => {
  // One sanctioned close path (X / backdrop / Esc, idempotent).
  const { requestClose, handleOverlayClick } = useDialogClose({ isOpen, onClose });

  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'status' | 'schedule'>('status');

  // Status Form state
  const [selectedStatus, setSelectedStatus] = useState<
    'available' | 'busy' | 'away' | 'leave' | 'offline'
  >('available');
  const [customText, setCustomText] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number | null>(60);

  // Schedule Form state
  const [timezone, setTimezone] = useState('UTC');
  const [schedule, setSchedule] = useState<Record<string, any>>({
    monday: { start: '09:00', end: '18:00', active: true },
    tuesday: { start: '09:00', end: '18:00', active: true },
    wednesday: { start: '09:00', end: '18:00', active: true },
    thursday: { start: '09:00', end: '18:00', active: true },
    friday: { start: '09:00', end: '18:00', active: true },
    saturday: { start: '10:00', end: '14:00', active: false },
    sunday: { start: '10:00', end: '14:00', active: false },
  });

  // Load current presence & working hours
  const { data: currentPresence } = useQuery({
    queryKey: ['presence', 'me'],
    queryFn: () => presenceService.getMyPresence(),
    enabled: isOpen,
  });

  const { data: workingHoursConfig } = useQuery({
    queryKey: ['presence', 'working-hours'],
    queryFn: () => presenceService.getWorkingHours(),
    enabled: isOpen,
  });

  useEffect(() => {
    if (currentPresence) {
      setSelectedStatus(currentPresence.status);
      setCustomText(currentPresence.customStatusText || '');
    }
  }, [currentPresence]);

  useEffect(() => {
    if (workingHoursConfig) {
      setTimezone(workingHoursConfig.timezone || 'UTC');
      if (workingHoursConfig.schedule) {
        setSchedule(workingHoursConfig.schedule);
      }
    }
  }, [workingHoursConfig]);

  const saveStatusMutation = useMutation({
    mutationFn: () =>
      presenceService.setMyPresence({
        status: selectedStatus,
        customStatusText: customText.trim() || null,
        expiresInMinutes: durationMinutes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presence', 'me'] });
      requestClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to update status');
    },
  });

  const clearOverrideMutation = useMutation({
    mutationFn: () => presenceService.clearMyPresence(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presence', 'me'] });
      requestClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to clear status');
    },
  });

  const saveScheduleMutation = useMutation({
    mutationFn: () =>
      presenceService.updateWorkingHours({
        timezone,
        schedule,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presence', 'working-hours'] });
      queryClient.invalidateQueries({ queryKey: ['presence', 'me'] });
      requestClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to update working hours');
    },
  });

  const updateDaySchedule = (day: string, field: string, value: any) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 pb-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground">Presence & Working Hours</h3>
              <p className="text-xs text-muted-foreground">
                Set your availability status or customize your weekly working schedule
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-border px-5 bg-muted/20">
          <button
            type="button"
            onClick={() => setTab('status')}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === 'status'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Presence Status
          </button>
          <button
            type="button"
            onClick={() => setTab('schedule')}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === 'schedule'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Working Hours & Timezone
          </button>
        </div>

        {/* Tab 1: Presence Status Override */}
        {tab === 'status' && (
          <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Status Choices */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Current Status</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'available', label: 'Available', dot: 'available' },
                  { key: 'busy', label: 'Busy / In Meeting', dot: 'busy' },
                  { key: 'away', label: 'Away / Out', dot: 'away' },
                  { key: 'leave', label: 'On Leave', dot: 'leave' },
                  { key: 'offline', label: 'Appear Offline', dot: 'offline' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedStatus(item.key as any)}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-colors cursor-pointer ${
                      selectedStatus === item.key
                        ? 'border-primary/50 bg-primary/10 text-foreground font-semibold'
                        : 'border-border hover:bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <PresenceBadge status={item.dot as any} size="sm" />
                    <span className="text-xs">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Status Message */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Status Message</label>
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="e.g. Reviewing PRs, Back at 2 PM, Focused"
                className="w-full px-3 py-2 text-xs rounded-xl bg-muted/40 border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              />
            </div>

            {/* Clear Status After */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Clear status after</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: '30 mins', val: 30 },
                  { label: '1 hour', val: 60 },
                  { label: '4 hours', val: 240 },
                  { label: 'Today', val: 720 },
                  { label: "Don't clear", val: null },
                ].map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => setDurationMinutes(d.val)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      durationMinutes === d.val
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border bg-muted/40 hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {currentPresence?.isManualOverride && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
                <span>Currently using manual override status.</span>
                <button
                  type="button"
                  onClick={() => clearOverrideMutation.mutate()}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-100 font-semibold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset to automatic</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Weekly Schedule & Timezone */}
        {tab === 'schedule' && (
          <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Timezone selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Your Timezone</span>
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-muted/40 border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors cursor-pointer"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            {/* Weekly Days Grid */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Weekly Working Days</label>
              <div className="rounded-xl border border-border divide-y divide-border/60">
                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(
                  (day) => {
                    const dayConfig = schedule[day] || {
                      start: '09:00',
                      end: '18:00',
                      active: false,
                    };
                    return (
                      <div
                        key={day}
                        className="p-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 w-28">
                          <input
                            type="checkbox"
                            checked={!!dayConfig.active}
                            onChange={(e) => updateDaySchedule(day, 'active', e.target.checked)}
                            className="w-4 h-4 rounded border-border text-primary cursor-pointer"
                          />
                          <span className="font-semibold capitalize text-foreground">
                            {day.slice(0, 3)}
                          </span>
                        </div>

                        {dayConfig.active ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={dayConfig.start}
                              onChange={(e) => updateDaySchedule(day, 'start', e.target.value)}
                              className="px-2 py-1 bg-muted/40 border border-border rounded-lg text-xs outline-none focus:border-primary"
                            />
                            <span className="text-muted-foreground">to</span>
                            <input
                              type="time"
                              value={dayConfig.end}
                              onChange={(e) => updateDaySchedule(day, 'end', e.target.value)}
                              className="px-2 py-1 bg-muted/40 border border-border rounded-lg text-xs outline-none focus:border-primary"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Day off</span>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 bg-muted/20 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={requestClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Cancel
          </button>
          {tab === 'status' ? (
            <button
              type="button"
              disabled={saveStatusMutation.isPending}
              onClick={() => saveStatusMutation.mutate()}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              {saveStatusMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Status</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={saveScheduleMutation.isPending}
              onClick={() => saveScheduleMutation.mutate()}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              {saveScheduleMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Schedule</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
