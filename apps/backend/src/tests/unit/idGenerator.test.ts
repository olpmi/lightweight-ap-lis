import { describe, it, expect } from 'vitest';
import { nextSpecimenCode, generateBlockId, generateSlideId } from '../../utils/idGenerator.js';

describe('nextSpecimenCode', () => {
  it('returns A for empty list', () => {
    expect(nextSpecimenCode([])).toBe('A');
  });

  it('increments A to B', () => {
    expect(nextSpecimenCode(['A'])).toBe('B');
  });

  it('increments Z to AA', () => {
    const codes = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    expect(nextSpecimenCode(codes)).toBe('AA');
  });

  it('increments AZ to BA', () => {
    const codes = ['A', 'B', 'AA', 'AB', 'AZ'];
    expect(nextSpecimenCode(codes)).toBe('BA');
  });

  it('handles unsorted input', () => {
    expect(nextSpecimenCode(['B', 'A', 'C'])).toBe('D');
  });
});

describe('generateBlockId', () => {
  it('formats correctly', () => {
    expect(generateBlockId('SU250000001', 'A', 1)).toBe('SU250000001-A1');
    expect(generateBlockId('SU250000001', 'A', 2)).toBe('SU250000001-A2');
    expect(generateBlockId('SU250000001', 'AA', 1)).toBe('SU250000001-AA1');
  });
});

describe('generateSlideId', () => {
  it('formats correctly', () => {
    expect(generateSlideId('SU250000001-A1', 1)).toBe('SU250000001-A1-S1');
    expect(generateSlideId('SU250000001-A1', 2)).toBe('SU250000001-A1-S2');
    expect(generateSlideId('SU250000001-AA3', 1)).toBe('SU250000001-AA3-S1');
  });
});
