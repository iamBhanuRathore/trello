import React from 'react';
import { ShieldCheck, Shield, Eye } from 'lucide-react';

export const ROLE_DESCRIPTIONS: Record<
  string,
  { title: string; description: string; icon: React.ComponentType<{ className?: string }> }
> = {
  org_owner: {
    title: 'Org Owner',
    description: 'Full root organization control, billing, audit logs, and member management.',
    icon: ShieldCheck,
  },
  org_admin: {
    title: 'Org Admin',
    description: 'Full organization management, member invitations, and security policies.',
    icon: ShieldCheck,
  },
  member: {
    title: 'Member',
    description: 'Standard collaborator. Can create and edit workspaces, boards, and tasks.',
    icon: Shield,
  },
  viewer: {
    title: 'Viewer',
    description: 'Read-only access. Can view projects, boards, and tasks without editing.',
    icon: Eye,
  },
};

export function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'Never';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 2) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Never';
  }
}
