/**
 * Build Prisma `orderId` filter conditions for a search term that may be
 * a full or partial human-readable case ID (e.g. "SU-26-5" or "SU-26-16").
 *
 * Logic:
 *   SU / SU- / SU-2 / SU-26 / SU-26-  → strip hyphens → startsWith (prefix search)
 *   SU-26-1 / SU-26-16                 → range queries (zero-padding breaks substring)
 *   SU260000161  (canonical)            → startsWith (exact prefix)
 *   Smith, Garcia                       → contains (patient name, handled by caller)
 */
export function buildOrderIdConditions(search: string): object[] {
  const trimmed = search.trim().toUpperCase();

  // Full human-readable with complete 2-digit year AND at least 1 sequence digit
  // e.g. SU-26-1, SU-26-16, SU-26-161
  // Must use range queries because zero-padding means "SU261" is NOT a substring of "SU260000161"
  const fullMatch = trimmed.match(/^([A-Z]{2})-(\d{2})-(\d+)$/);
  if (fullMatch) {
    const [, prefix, year, partialSeq] = fullMatch;
    const conditions: object[] = [];
    for (let totalLen = partialSeq.length; totalLen <= 7; totalLen++) {
      const multiplier = Math.pow(10, totalLen - partialSeq.length);
      const seqStart = parseInt(partialSeq, 10) * multiplier;
      const seqEnd = seqStart + multiplier - 1;
      const canonStart = `${prefix}${year}${String(seqStart).padStart(7, '0')}`;
      const canonEnd = `${prefix}${year}${String(seqEnd).padStart(7, '0')}`;
      if (canonStart === canonEnd) {
        conditions.push({ orderId: { equals: canonStart } });
      } else {
        conditions.push({ orderId: { gte: canonStart, lte: canonEnd } });
      }
    }
    return conditions;
  }

  // Anything that looks like a partial case ID: 2 letters optionally followed by
  // hyphens and/or digits in any combination.
  // Strip hyphens then do a startsWith.
  //   SU     → startsWith "SU"
  //   SU-    → startsWith "SU"
  //   SU-2   → startsWith "SU2"   (partial year — don't pad, user hasn't finished)
  //   SU-26  → startsWith "SU26"
  //   SU-26- → startsWith "SU26"
  if (trimmed.match(/^[A-Z]{2}[-\d]*$/)) {
    const stripped = trimmed.replace(/-/g, '');
    return [{ orderId: { startsWith: stripped } }];
  }

  // Plain text (patient name etc.) — caller adds its own OR conditions
  return [{ orderId: { contains: trimmed, mode: 'insensitive' as const } }];
}

