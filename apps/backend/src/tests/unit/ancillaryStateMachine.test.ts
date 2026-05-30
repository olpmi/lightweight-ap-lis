import { describe, expect, it } from 'vitest';
import {
  ANCILLARY_TERMINAL_STATUSES,
  type AncillaryStatus,
  isAncillaryTerminal,
  isValidAncillaryTransition,
} from '@lis/shared';

describe('ancillary state machine', () => {
  it('exposes the three terminal statuses', () => {
    expect(ANCILLARY_TERMINAL_STATUSES.has('DISTRIBUTED')).toBe(true);
    expect(ANCILLARY_TERMINAL_STATUSES.has('MATERIAL_RETURNED')).toBe(true);
    expect(ANCILLARY_TERMINAL_STATUSES.has('CANCELLED')).toBe(true);
    expect(ANCILLARY_TERMINAL_STATUSES.size).toBe(3);
  });

  it('isAncillaryTerminal reflects the set', () => {
    expect(isAncillaryTerminal('DISTRIBUTED')).toBe(true);
    expect(isAncillaryTerminal('PULL_BLOCK')).toBe(false);
  });

  describe('slide pipeline', () => {
    it('allows the canonical forward path', () => {
      expect(isValidAncillaryTransition('PULL_BLOCK', 'MICROTOMY')).toBe(true);
      expect(isValidAncillaryTransition('MICROTOMY', 'SLIDE_STAIN')).toBe(true);
      expect(isValidAncillaryTransition('SLIDE_STAIN', 'DISTRIBUTED')).toBe(true);
    });

    it('forbids skipping stages', () => {
      expect(isValidAncillaryTransition('PULL_BLOCK', 'SLIDE_STAIN')).toBe(false);
      expect(isValidAncillaryTransition('PULL_BLOCK', 'DISTRIBUTED')).toBe(false);
      expect(isValidAncillaryTransition('MICROTOMY', 'DISTRIBUTED')).toBe(false);
    });

    it('forbids backward transitions', () => {
      expect(isValidAncillaryTransition('MICROTOMY', 'PULL_BLOCK')).toBe(false);
      expect(isValidAncillaryTransition('SLIDE_STAIN', 'MICROTOMY')).toBe(false);
      expect(isValidAncillaryTransition('DISTRIBUTED', 'SLIDE_STAIN')).toBe(false);
    });
  });

  describe('material pipeline', () => {
    it('allows the canonical forward path', () => {
      expect(isValidAncillaryTransition('PULL_MATERIAL', 'MATERIAL_SENT')).toBe(true);
      expect(isValidAncillaryTransition('MATERIAL_SENT', 'MATERIAL_RETURNED')).toBe(true);
    });

    it('forbids cross-pipeline jumps', () => {
      expect(isValidAncillaryTransition('PULL_BLOCK', 'PULL_MATERIAL')).toBe(false);
      expect(isValidAncillaryTransition('PULL_MATERIAL', 'MICROTOMY')).toBe(false);
      expect(isValidAncillaryTransition('MATERIAL_SENT', 'DISTRIBUTED')).toBe(false);
    });
  });

  describe('cancellation', () => {
    it('allows CANCELLED from every non-terminal state', () => {
      const nonTerminal: AncillaryStatus[] = [
        'PULL_BLOCK',
        'MICROTOMY',
        'SLIDE_STAIN',
        'PULL_MATERIAL',
        'MATERIAL_SENT',
      ];
      for (const from of nonTerminal) {
        expect(isValidAncillaryTransition(from, 'CANCELLED')).toBe(true);
      }
    });

    it('forbids leaving any terminal state', () => {
      const terminals: AncillaryStatus[] = ['DISTRIBUTED', 'MATERIAL_RETURNED', 'CANCELLED'];
      const allOthers: AncillaryStatus[] = [
        'PULL_BLOCK',
        'MICROTOMY',
        'SLIDE_STAIN',
        'PULL_MATERIAL',
        'MATERIAL_SENT',
        'DISTRIBUTED',
        'MATERIAL_RETURNED',
        'CANCELLED',
      ];
      for (const from of terminals) {
        for (const to of allOthers) {
          expect(isValidAncillaryTransition(from, to)).toBe(false);
        }
      }
    });
  });

  it('rejects no-op self-transitions', () => {
    expect(isValidAncillaryTransition('MICROTOMY', 'MICROTOMY')).toBe(false);
    expect(isValidAncillaryTransition('PULL_BLOCK', 'PULL_BLOCK')).toBe(false);
  });
});
