// Ancillary order state machine.
//
// Two pipelines plus cancellation:
//   Slide:    PULL_BLOCK    -> MICROTOMY     -> SLIDE_STAIN       -> DISTRIBUTED   (terminal)
//   Material: PULL_MATERIAL -> MATERIAL_SENT -> MATERIAL_RETURNED (terminal)
//   CANCELLED reachable from any non-terminal state in either pipeline (terminal).
//
// Used both server-side (transition validation in ancillary.service.updateStatus)
// and shared with the frontend if needed.

export type AncillaryStatus =
  | 'PULL_BLOCK'
  | 'MICROTOMY'
  | 'SLIDE_STAIN'
  | 'DISTRIBUTED'
  | 'PULL_MATERIAL'
  | 'MATERIAL_SENT'
  | 'MATERIAL_RETURNED'
  | 'CANCELLED';

export const ANCILLARY_TERMINAL_STATUSES: ReadonlySet<AncillaryStatus> = new Set([
  'DISTRIBUTED',
  'MATERIAL_RETURNED',
  'CANCELLED',
]);

const TRANSITIONS: Record<AncillaryStatus, ReadonlySet<AncillaryStatus>> = {
  PULL_BLOCK: new Set<AncillaryStatus>(['MICROTOMY', 'CANCELLED']),
  MICROTOMY: new Set<AncillaryStatus>(['SLIDE_STAIN', 'CANCELLED']),
  SLIDE_STAIN: new Set<AncillaryStatus>(['DISTRIBUTED', 'CANCELLED']),
  PULL_MATERIAL: new Set<AncillaryStatus>(['MATERIAL_SENT', 'CANCELLED']),
  MATERIAL_SENT: new Set<AncillaryStatus>(['MATERIAL_RETURNED', 'CANCELLED']),
  // Terminal states — no outgoing transitions.
  DISTRIBUTED: new Set<AncillaryStatus>(),
  MATERIAL_RETURNED: new Set<AncillaryStatus>(),
  CANCELLED: new Set<AncillaryStatus>(),
};

export function isAncillaryTerminal(status: AncillaryStatus): boolean {
  return ANCILLARY_TERMINAL_STATUSES.has(status);
}

export function isValidAncillaryTransition(
  from: AncillaryStatus,
  to: AncillaryStatus,
): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.has(to) ?? false;
}
