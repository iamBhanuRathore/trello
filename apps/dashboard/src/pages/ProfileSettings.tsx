import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boardly/ui/select';
import { Dialog, DialogContent, DialogTitle } from '@boardly/ui/dialog';
import { QueryError } from '../components/common/QueryError';
import {
  User,
  Shield,
  Key,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Save,
  Check,
  Building2,
  Lock,
  ShieldCheck,
  Search,
  ChevronRight,
  Info,
} from 'lucide-react';
import { useDialogClose } from '../hooks/useDialogClose';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
];

const TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'Eastern Time (US & Canada) - New York' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada) - Chicago' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada) - Denver' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada) - Los Angeles' },
  { value: 'Europe/London', label: 'London, Edinburgh, Dublin (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris, Berlin, Rome, Madrid (CET)' },
  { value: 'Asia/Dubai', label: 'Dubai, Abu Dhabi, Muscat (GST)' },
  { value: 'Asia/Kolkata', label: 'India Standard Time - Mumbai, New Delhi' },
  { value: 'Asia/Singapore', label: 'Singapore, Kuala Lumpur (SGT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo, Osaka, Seoul (JST/KST)' },
  { value: 'Australia/Sydney', label: 'Sydney, Melbourne, Canberra (AEST)' },
];

export function ProfileSettings() {
  const queryClient = useQueryClient();
  const checkAuth = useAuthStore((state) => state.checkAuth);

  // Profile fields state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');
  const [profileErrorMsg, setProfileErrorMsg] = useState('');

  // Password fields state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState('');
  const [passwordErrorMsg, setPasswordErrorMsg] = useState('');

  // Permissions Modal state
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [permissionFilter, setPermissionFilter] = useState<'all' | 'granted' | 'restricted'>('all');
  const [permissionSearch, setPermissionSearch] = useState('');

  // Fetch full user profile
  const {
    data: profile,
    isLoading,
    isError: isProfileError,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  // Fetch detailed user RBAC permissions
  const {
    data: permissionsData,
    isLoading: isPermissionsLoading,
    isError: isPermissionsError,
    refetch: refetchPermissions,
  } = useQuery({
    queryKey: ['auth', 'permissions'],
    queryFn: async () => (await api.get('/auth/permissions')).data,
  });

  // Sync profile data to form
  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setEmail(profile.email || '');
      setAvatarUrl(profile.avatarUrl || '');
      setTimezone(profile.timezone || 'UTC');
    }
  }, [profile]);

  // Update Profile Mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: { name: string; avatarUrl?: string | null; timezone?: string }) => {
      const res = await api.patch('/auth/profile', data);
      return res.data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      await checkAuth();
      setProfileSuccessMsg('Profile updated successfully!');
      setProfileErrorMsg('');
      setTimeout(() => setProfileSuccessMsg(''), 4000);
    },
    onError: (err: any) => {
      setProfileErrorMsg(err.response?.data?.error || 'Failed to update profile.');
      setProfileSuccessMsg('');
    },
  });

  // Change / Set Password Mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword?: string; newPassword: string }) => {
      const res = await api.post('/auth/change-password', data);
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      setPasswordSuccessMsg(data.message || 'Password updated successfully!');
      setPasswordErrorMsg('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccessMsg(''), 4000);
    },
    onError: (err: any) => {
      setPasswordErrorMsg(err.response?.data?.error || 'Failed to update password.');
      setPasswordSuccessMsg('');
    },
  });

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setProfileErrorMsg('Full name is required.');
      return;
    }
    updateProfileMutation.mutate({
      name: name.trim(),
      avatarUrl: avatarUrl.trim() || null,
      timezone: timezone || 'UTC',
    });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setPasswordErrorMsg('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErrorMsg('New passwords do not match.');
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: currentPassword.trim() || undefined,
      newPassword,
    });
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'org_owner':
        return 'Organization Owner';
      case 'org_admin':
      case 'admin':
        return 'Administrator';
      case 'billing_manager':
        return 'Billing Manager';
      case 'workspace_admin':
        return 'Workspace Admin';
      case 'viewer':
        return 'Viewer (Read-Only)';
      default:
        return 'Member';
    }
  };

  // Flatten and filter permissions for modal view
  const allPermissionsList = useMemo(() => {
    if (!permissionsData?.categories) return [];
    const list: Array<{
      key: string;
      description: string;
      granted: boolean;
      categoryLabel: string;
    }> = [];

    Object.values(permissionsData.categories).forEach((cat: any) => {
      cat.items.forEach((item: any) => {
        list.push({
          ...item,
          categoryLabel: cat.label,
        });
      });
    });

    return list.filter((p) => {
      const matchesFilter =
        permissionFilter === 'all' ? true : permissionFilter === 'granted' ? p.granted : !p.granted;
      const matchesSearch =
        p.key.toLowerCase().includes(permissionSearch.toLowerCase()) ||
        p.description.toLowerCase().includes(permissionSearch.toLowerCase()) ||
        p.categoryLabel.toLowerCase().includes(permissionSearch.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [permissionsData, permissionFilter, permissionSearch]);

  const showLoading = isLoading && !profile;

  // Never render the form on a failed profile fetch — saving would push blank
  // values over the real profile.
  if (isProfileError && !profile) {
    return (
      <div className="max-w-4xl mx-auto py-4">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">User Profile & Account Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your personal details, profile picture, preferences, and view your assigned
            access permissions.
          </p>
        </div>
        <QueryError
          message="Couldn't load your profile. Check your connection and try again."
          onRetry={() => refetchProfile()}
          className="min-h-[50vh]"
        />
      </div>
    );
  }

  // Single close path (AGENTS.md §11) — requestClose is idempotent per
  // open session, so X / backdrop / Esc cannot double-close.
  const { handleOpenChange } = useDialogClose({
    isOpen: isPermissionsModalOpen,
    onClose: () => setIsPermissionsModalOpen(false),
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4 pb-16" aria-busy={showLoading}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">User Profile & Account Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your personal details, profile picture, preferences, and view your assigned access
          permissions.
        </p>
      </div>

      {showLoading ? (
        <div className="space-y-8" aria-label="Loading user profile">
          {/* Overview card mirror */}
          <div className="p-6 rounded-2xl border border-border bg-card/60 flex flex-col sm:flex-row items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-muted animate-pulse shrink-0" />
            <div className="flex-1 w-full space-y-2">
              <div className="h-6 w-48 rounded-lg bg-muted animate-pulse" />
              <div className="h-4 w-64 rounded bg-muted/70 animate-pulse" />
            </div>
          </div>
          {/* Form grid mirror */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl border border-border bg-card/60 space-y-4">
              <div className="h-5 w-40 rounded bg-muted animate-pulse" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-24 rounded bg-muted/70 animate-pulse" />
                  <div className="h-10 rounded-lg bg-muted/60 animate-pulse" />
                </div>
              ))}
            </div>
            <div className="p-6 rounded-2xl border border-border bg-card/60 space-y-4">
              <div className="h-5 w-40 rounded bg-muted animate-pulse" />
              {[0, 1].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-muted/60 animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Profile Overview Card */}
          <div className="p-6 rounded-2xl border border-border bg-card/60 backdrop-blur-sm flex flex-col sm:flex-row items-center sm:items-start gap-6 shadow-sm">
            <div className="relative group">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={name || 'Profile'}
                  className="w-20 h-20 rounded-2xl object-cover ring-2 ring-primary/30 shadow-md"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center text-2xl font-bold text-primary-foreground shadow-md">
                  {name ? name.substring(0, 2).toUpperCase() : 'U'}
                </div>
              )}
            </div>

            <div className="flex-1 text-center sm:text-left space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <h2 className="text-xl font-bold text-foreground">{name || 'Unnamed User'}</h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 w-fit mx-auto sm:mx-0">
                  <Shield className="w-3 h-3 mr-1" /> {getRoleLabel(profile?.role)}
                </span>
              </div>

              <div className="flex items-center justify-center sm:justify-start gap-2">
                <p className="text-sm text-muted-foreground">{email}</p>
                {profile?.avatarUrl?.includes('workos') || !profile?.hasPassword ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.2 rounded-full border border-emerald-500/20">
                    <Check className="w-2.5 h-2.5" /> Google OAuth
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 pt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  {timezone}
                </span>
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-primary" />
                  Organization Member
                </span>
                {profile?.createdAt && (
                  <span className="text-muted-foreground/80">
                    Joined{' '}
                    {new Date(profile.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 2-Column Grid: Profile Details & Security/Permissions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Column: Personal Information Form */}
            <div className="p-6 rounded-2xl border border-border bg-card/60 backdrop-blur-sm space-y-6 shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-border pb-3">
                <User className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  Personal Information
                </h3>
              </div>

              {profileSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{profileSuccessMsg}</span>
                </div>
              )}

              {profileErrorMsg && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{profileErrorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold mb-1.5 block">Full Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                    className="h-9 text-xs"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-xs font-semibold">Email Address</Label>
                    {profile?.avatarUrl?.includes('workos') || !profile?.hasPassword ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <Lock className="w-2.5 h-2.5" /> Google OAuth
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
                        <Lock className="w-2.5 h-2.5" /> Primary Account
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      type="email"
                      value={email}
                      readOnly
                      disabled
                      className="h-9 text-xs bg-muted/40 text-muted-foreground border-border/80 cursor-not-allowed pr-8 font-medium select-all"
                    />
                    <Lock className="w-3.5 h-3.5 text-muted-foreground/60 absolute right-2.5 top-2.5 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {profile?.avatarUrl?.includes('workos') || !profile?.hasPassword
                      ? 'Your email is verified and managed by your Google account.'
                      : 'Your email address is your verified account identifier and cannot be changed here.'}
                  </p>
                </div>

                <div>
                  <Label className="text-xs font-semibold mb-1.5 block">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold mb-1.5 block">Profile Photo URL</Label>
                  <Input
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="h-9 text-xs"
                  />

                  {/* Preset avatar quick choices */}
                  <div className="mt-3">
                    <Label className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-primary" /> Or pick a preset avatar:
                    </Label>
                    <div className="flex items-center gap-2">
                      {PRESET_AVATARS.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setAvatarUrl(preset)}
                          className={`relative w-8 h-8 rounded-full overflow-hidden border-2 transition-all cursor-pointer ${
                            avatarUrl === preset
                              ? 'border-primary ring-2 ring-primary/30 scale-105'
                              : 'border-border/80 hover:border-primary/50'
                          }`}
                        >
                          <img src={preset} alt="Preset" className="w-full h-full object-cover" />
                          {avatarUrl === preset && (
                            <div className="absolute inset-0 bg-primary/40 flex items-center justify-center text-primary-foreground">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          )}
                        </button>
                      ))}
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setAvatarUrl('')}
                          className="text-[11px] text-muted-foreground hover:text-destructive hover:underline ml-2 cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={updateProfileMutation.isPending}
                    className="w-full h-9 text-xs font-semibold gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {updateProfileMutation.isPending ? 'Saving changes...' : 'Save Profile Changes'}
                  </Button>
                </div>
              </form>
            </div>

            {/* Right Column: Security & RBAC Permissions Matrix */}
            <div className="space-y-6">
              {/* Change / Set Password Card */}
              <div className="p-6 rounded-2xl border border-border bg-card/60 backdrop-blur-sm space-y-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2.5">
                    <Key className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                      {profile?.hasPassword ? 'Security & Password' : 'Set Up Password'}
                    </h3>
                  </div>
                  {!profile?.hasPassword && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                      <Sparkles className="w-2.5 h-2.5" /> OAuth Account
                    </span>
                  )}
                </div>

                {passwordSuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{passwordSuccessMsg}</span>
                  </div>
                )}

                {passwordErrorMsg && (
                  <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{passwordErrorMsg}</span>
                  </div>
                )}

                {!profile?.hasPassword && (
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/15 text-xs text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
                      <Sparkles className="w-3.5 h-3.5 text-primary" /> Google OAuth Authentication
                      Active
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      You currently log in using your Google account without a password. If you
                      would like to also sign in directly using email and password, you can set a
                      password below.
                    </p>
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="space-y-4">
                  {profile?.hasPassword && (
                    <div>
                      <Label className="text-xs font-semibold mb-1.5 block">Current Password</Label>
                      <Input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        className="h-9 text-xs"
                        required
                      />
                    </div>
                  )}

                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">
                      {profile?.hasPassword ? 'New Password' : 'Create Password'}
                    </Label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="h-9 text-xs"
                      required
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">
                      {profile?.hasPassword ? 'Confirm New Password' : 'Confirm Password'}
                    </Label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="h-9 text-xs"
                      required
                    />
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={changePasswordMutation.isPending}
                      className="w-full h-9 text-xs font-semibold gap-1.5 cursor-pointer"
                    >
                      {profile?.hasPassword ? (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          {changePasswordMutation.isPending
                            ? 'Updating password...'
                            : 'Update Password'}
                        </>
                      ) : (
                        <>
                          <Key className="w-3.5 h-3.5 text-primary" />
                          {changePasswordMutation.isPending
                            ? 'Setting password...'
                            : 'Set Account Password'}
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>

              {/* ─── Assigned Permissions & Access Matrix Card ─── */}
              <div className="p-6 rounded-2xl border border-border bg-card/60 backdrop-blur-sm space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                      My Assigned Permissions
                    </h3>
                  </div>
                  {permissionsData && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                      {permissionsData.totalGranted} of {permissionsData.totalPermissions} active
                    </span>
                  )}
                </div>

                <div className="space-y-2.5">
                  <div className="p-3 rounded-xl bg-muted/40 border border-border/80 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">
                        Active System Role
                      </span>
                      <span className="font-bold text-foreground text-sm">
                        {permissionsData?.user?.roleTitle || getRoleLabel(profile?.role)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 gap-1"
                      onClick={() => setIsPermissionsModalOpen(true)}
                    >
                      <span>View All Permissions</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Categorized preview chips */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {isPermissionsLoading && !permissionsData ? (
                      [0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="h-14 rounded-xl bg-muted/60 animate-pulse"
                          aria-label="Loading permissions"
                        />
                      ))
                    ) : isPermissionsError && !permissionsData ? (
                      <div className="col-span-2">
                        <QueryError
                          compact
                          message="Couldn't load permissions."
                          onRetry={() => refetchPermissions()}
                        />
                      </div>
                    ) : (
                      permissionsData?.categories &&
                      Object.entries(permissionsData.categories).map(
                        ([key, cat]: [string, any]) => {
                          const grantedInCat = cat.items.filter((i: any) => i.granted).length;
                          const totalInCat = cat.items.length;
                          const isAllGranted = grantedInCat === totalInCat;

                          return (
                            <div
                              key={key}
                              className="p-2.5 rounded-xl border border-border/70 bg-background/50 space-y-1 cursor-pointer hover:bg-muted/30 transition-colors"
                              onClick={() => setIsPermissionsModalOpen(true)}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-foreground truncate">
                                  {cat.label}
                                </span>
                                {isAllGranted ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                ) : (
                                  <Lock className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {grantedInCat}/{totalInCat} permissions
                              </div>
                            </div>
                          );
                        }
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Detailed Permissions Matrix Modal ─── */}
          {isPermissionsModalOpen && (
            <Dialog open={isPermissionsModalOpen} onOpenChange={handleOpenChange}>
              <DialogContent className="sm:max-w-2xl w-[92vw] max-h-[85vh] p-0 overflow-hidden flex flex-col bg-card border border-border rounded-2xl shadow-2xl">
                {/* Header */}
                <div className="p-5 pr-14 border-b border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <DialogTitle className="text-base font-bold text-foreground truncate">
                        Role &amp; Permissions Matrix
                      </DialogTitle>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        Detailed breakdown of your capabilities as{' '}
                        <strong className="text-foreground font-semibold">
                          {permissionsData?.user?.roleTitle || getRoleLabel(profile?.role)}
                        </strong>
                        .
                      </p>
                    </div>
                  </div>

                  <div className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 self-start sm:self-auto shrink-0">
                    {permissionsData?.totalGranted} of {permissionsData?.totalPermissions} granted
                  </div>
                </div>

                {/* Controls: Search & Granted/Restricted Tabs */}
                <div className="p-4 border-b border-border bg-card space-y-3">
                  <div className="flex flex-col sm:flex-row items-center gap-2.5">
                    <div className="relative flex-1 w-full">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Search permissions by name or description..."
                        className="pl-9 h-9 text-xs"
                        value={permissionSearch}
                        onChange={(e) => setPermissionSearch(e.target.value)}
                      />
                    </div>

                    <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl border border-border w-full sm:w-auto">
                      <button
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                          permissionFilter === 'all'
                            ? 'bg-background text-foreground shadow-2xs font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setPermissionFilter('all')}
                      >
                        All ({permissionsData?.totalPermissions || 0})
                      </button>
                      <button
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                          permissionFilter === 'granted'
                            ? 'bg-background text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setPermissionFilter('granted')}
                      >
                        Allowed ({permissionsData?.totalGranted || 0})
                      </button>
                      <button
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                          permissionFilter === 'restricted'
                            ? 'bg-background text-foreground shadow-2xs font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setPermissionFilter('restricted')}
                      >
                        Restricted (
                        {(permissionsData?.totalPermissions || 0) -
                          (permissionsData?.totalGranted || 0)}
                        )
                      </button>
                    </div>
                  </div>
                </div>

                {/* Permission Items List */}
                <div className="flex-1 overflow-y-auto divide-y divide-border/60 p-2 sm:p-4 space-y-1">
                  {isPermissionsLoading && !permissionsData ? (
                    <div className="p-4 space-y-2" aria-label="Loading permissions">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="h-12 rounded-xl bg-muted/60 animate-pulse" />
                      ))}
                    </div>
                  ) : isPermissionsError && !permissionsData ? (
                    <QueryError
                      message="Couldn't load permissions."
                      onRetry={() => refetchPermissions()}
                    />
                  ) : allPermissionsList.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      No permissions matching your filter.
                    </div>
                  ) : (
                    allPermissionsList.map((perm) => (
                      <div
                        key={perm.key}
                        className={`p-3 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                          perm.granted ? 'hover:bg-muted/40' : 'hover:bg-muted/20 opacity-75'
                        }`}
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-foreground">
                              {perm.description}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.2 rounded border border-border/60">
                              {perm.key}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Category: {perm.categoryLabel}
                          </div>
                        </div>

                        <div className="shrink-0">
                          {perm.granted ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                              <Check className="w-3 h-3" /> Allowed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2.5 py-0.5 rounded-full border border-border/80">
                              <Lock className="w-3 h-3 text-muted-foreground/70" /> Restricted
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-border bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground px-5">
                  <span className="flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" /> Permissions are governed by Organization &amp;
                    Role-based Access Control (RBAC).
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setIsPermissionsModalOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </>
      )}
    </div>
  );
}
