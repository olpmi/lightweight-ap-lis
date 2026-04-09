import { prisma } from '../lib/prisma.js';

/**
 * Generate the next order ID using a transaction-safe sequence.
 * Format: {PREFIX}{YY}{NNNNNNN}  e.g. SU250000001 or CN250000001
 * Prefix is 'CN' for Cytology cases, 'SU' for all others.
 * The sequence resets each year.
 */
export async function generateOrderId(caseType?: string): Promise<string> {
  const prefix = caseType === 'Cytology' ? 'CN' : 'SU';
  const yearTwoDigit = new Date().getFullYear() % 100;

  const result = await prisma.$transaction(async (tx) => {
    // Upsert the sequence row for this year+prefix (independent counters per prefix)
    const seq = await tx.orderSequenceYear.upsert({
      where: { yearTwoDigit_prefix: { yearTwoDigit, prefix } },
      create: { yearTwoDigit, prefix, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    return seq.lastValue;
  });

  const yearStr = String(yearTwoDigit).padStart(2, '0');
  const seqStr = String(result).padStart(7, '0');
  return `${prefix}${yearStr}${seqStr}`;
}

/**
 * Generate the next specimen code for an order.
 * Uses Excel-style alphabetic progression: A, B, ..., Z, AA, AB, ...
 */
export function nextSpecimenCode(existingCodes: string[]): string {
  if (existingCodes.length === 0) return 'A';
  const sorted = [...existingCodes].sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  });
  return incrementCode(sorted[sorted.length - 1]);
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
 * Generate a block ID from orderId, specimen code, and block number.
 * Format: {orderId}-{specimenCode}{blockNumber}  e.g. SU250000001-A1
 */
export function generateBlockId(orderId: string, specimenCode: string, blockNumber: number): string {
  return `${orderId}-${specimenCode}${blockNumber}`;
}

/**
 * Generate a slide ID from blockId and slide number.
 * Format: {blockId}-S{slideNumber}  e.g. SU250000001-A1-S1
 */
export function generateSlideId(blockId: string, slideNumber: number): string {
  return `${blockId}-S${slideNumber}`;
}
