import type { MediaAttachment } from '../../lib/api';

/**
 * Scan-gate status chip for uploads (5.5). Only `ready` rows render a read
 * link elsewhere; every other state renders this chip instead of bytes.
 */
export function MediaStatusChip({ att }: { att: MediaAttachment }) {
  const status = att.status || 'ready';
  const scan = att.scanStatus || 'pending';
  if (status === 'ready' && (scan === 'clean' || scan === 'skipped')) return null;
  const label =
    status === 'blocked' || scan === 'infected'
      ? 'Blocked'
      : status === 'failed' || scan === 'error'
        ? 'Failed'
        : status === 'scanning' || scan === 'pending'
          ? 'Scanning'
          : 'Staged';
  const cls =
    label === 'Blocked'
      ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
      : label === 'Failed'
        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
        : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30';
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}
      title={
        label === 'Scanning'
          ? 'Virus scan in progress — available shortly'
          : label === 'Blocked'
            ? 'Blocked by virus scan'
            : 'Upload failed — try again'
      }
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${label === 'Scanning' ? 'animate-pulse bg-current' : 'bg-current'}`}
      />
      {label}
    </span>
  );
}
