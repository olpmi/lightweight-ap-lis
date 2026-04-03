import { describe, it, expect } from 'vitest';
import { nextSpecimenCode } from '@lis/shared';

describe('nextSpecimenCode (shared)', () => {
  it('returns A for empty list', () => {
    expect(nextSpecimenCode([])).toBe('A');
  });

  it('increments Z to AA', () => {
    const all26 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    expect(nextSpecimenCode(all26)).toBe('AA');
  });
});
