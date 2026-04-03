/**
 * Generate the next specimen code using Excel-like alphabetic progression.
 * A, B, ..., Z, AA, AB, ..., AZ, BA, ...
 */
export function nextSpecimenCode(existing: string[]): string {
  if (existing.length === 0) return 'A';
  const sorted = [...existing].sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  });
  const last = sorted[sorted.length - 1];
  return incrementCode(last);
}

function incrementCode(code: string): string {
  const chars = code.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] !== 'Z') {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return chars.join('');
    }
    chars[i] = 'A';
    i--;
  }
  return 'A' + chars.join('');
}

/**
 * Format an order ID from year and sequence.
 */
export function formatOrderId(yearTwoDigit: number, sequence: number): string {
  const seqPadded = String(sequence).padStart(7, '0');
  const yearPadded = String(yearTwoDigit).padStart(2, '0');
  return `SU${yearPadded}${seqPadded}`;
}

/**
 * Convert a canonical order ID to human-readable form.
 * e.g. SU260000005 → SU-26-5
 */
export function formatOrderIdDisplay(orderId: string): string {
  const match = orderId.match(/^([A-Z]{2})(\d{2})(\d{7})$/);
  if (!match) return orderId;
  const [, prefix, year, seq] = match;
  return `${prefix}-${year}-${parseInt(seq, 10)}`;
}

/**
 * Normalize a human-readable or canonical order ID to the canonical form.
 * e.g. SU-26-5 → SU260000005  (canonical passthrough unchanged)
 */
export function normalizeOrderId(input: string): string {
  const humanMatch = input.trim().match(/^([A-Z]{2})-(\d{2})-(\d+)$/i);
  if (humanMatch) {
    const [, prefix, year, seq] = humanMatch;
    return `${prefix.toUpperCase()}${year.padStart(2, '0')}${seq.padStart(7, '0')}`;
  }
  return input;
}

/**
 * Normalize a free-text search term that may be a full or partial human-readable order ID.
 * Full:    SU-26-5  → SU260000005
 * Partial: SU-26    → SU26  (substring of SU26xxxxxxx, so `contains` still finds it)
 * Other:   Smith    → Smith (unchanged, for patient name searches)
 */
export function normalizeSearchTerm(input: string): string {
  const trimmed = input.trim();
  // Full human-readable: SU-26-5 → SU260000005
  const fullMatch = trimmed.match(/^([A-Z]{2})-(\d{2})-(\d+)$/i);
  if (fullMatch) {
    const [, prefix, year, seq] = fullMatch;
    return `${prefix.toUpperCase()}${year.padStart(2, '0')}${seq.padStart(7, '0')}`;
  }
  // Partial human-readable: starts with 2 letters followed by a hyphen → strip all hyphens
  // e.g. SU- → SU, SU-2 → SU2, SU-26 → SU26, SU-26- → SU26
  if (trimmed.match(/^[A-Z]{2}-/i)) {
    return trimmed.replace(/-/g, '').toUpperCase();
  }
  return trimmed;
}
