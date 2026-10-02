/**
 * Permanent typo-guard for the varchar status unions (Phase 1).
 *
 * These unions back `.$type<>()` column typings and `z.enum(*_VALUES)` input
 * schemas. Each `@ts-expect-error` below MUST keep erroring — if one stops
 * (because a value was legitimately added), update the union AND the Phase 0
 * data inventory, not just the test. Checked by `tsc --noEmit` in CI.
 */
import type {
  AutomationRunReason,
  AutomationRunStatus,
  CardAccessStatus,
  GitLinkKind,
  GitLinkState,
  InboundEmailStatus,
  MediaScanStatus,
  MediaStatus,
  SeatChangeDirection,
  SeatChangeStatus,
} from './index';

function acceptMedia(s: MediaStatus, scan: MediaScanStatus): void {
  void s;
  void scan;
}

// Valid members compile.
acceptMedia('ready', 'clean');

// Typo literals must NOT compile.
acceptMedia(
  // @ts-expect-error 'readey' is not a MediaStatus
  'readey',
  'clean'
);
acceptMedia(
  'ready',
  // @ts-expect-error 'cleen' is not a MediaScanStatus
  'cleen'
);

function acceptGit(kind: GitLinkKind, state: GitLinkState): void {
  void kind;
  void state;
}
acceptGit('pr', 'open');
acceptGit(
  // @ts-expect-error 'PR' (caps) is not a GitLinkKind
  'PR',
  'open'
);
acceptGit(
  'pr',
  // @ts-expect-error 'opne' is not a GitLinkState
  'opne'
);

function acceptAccess(s: CardAccessStatus): void {
  void s;
}
acceptAccess('approved');
acceptAccess(
  // @ts-expect-error 'approve' is not a CardAccessStatus
  'approve'
);

function acceptRun(status: AutomationRunStatus, reason: AutomationRunReason): void {
  void status;
  void reason;
}
acceptRun('skipped', 'DUPLICATE_EVENT');
acceptRun(
  // @ts-expect-error 'skip' is not an AutomationRunStatus
  'skip',
  'DUPLICATE_EVENT'
);
acceptRun(
  'skipped',
  // @ts-expect-error lowercase reason is not an AutomationRunReason
  'duplicate_event'
);

function acceptSeat(status: SeatChangeStatus, dir: SeatChangeDirection): void {
  void status;
  void dir;
}
acceptSeat('pending', 'increase');
acceptSeat(
  // @ts-expect-error 'pendin' is not a SeatChangeStatus
  'pendin',
  'increase'
);

function acceptInbound(s: InboundEmailStatus): void {
  void s;
}
acceptInbound('received');
acceptInbound(
  // @ts-expect-error 'recieved' is not an InboundEmailStatus
  'recieved'
);
