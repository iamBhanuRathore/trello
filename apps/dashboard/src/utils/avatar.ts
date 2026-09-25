// Canonical avatar helpers (single implementation — do not re-create per file).

export const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600 text-white',
  'from-emerald-500 to-teal-600 text-white',
  'from-purple-500 to-pink-600 text-white',
  'from-amber-500 to-orange-600 text-white',
  'from-rose-500 to-red-600 text-white',
  'from-cyan-500 to-blue-600 text-white',
  'from-violet-500 to-purple-600 text-white',
  'from-fuchsia-500 to-pink-600 text-white',
  'from-teal-500 to-emerald-600 text-white',
  'from-indigo-500 to-cyan-600 text-white',
];

/** Deterministic gradient class for a user identifier (name or email). */
export function getAvatarGradient(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = (hash << 5) - hash + identifier.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index]!;
}

/** Two-letter initials from name (fallback: email, then 'U'). */
export function getInitials(name?: string, email?: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  if (email && email.trim().length > 0) {
    return email.substring(0, 2).toUpperCase();
  }
  return 'U';
}
