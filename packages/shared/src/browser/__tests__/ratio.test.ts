import { describe, it, expect } from 'vitest';
import { clampRatio, DEFAULT_RATIO, MIN_RATIO, MAX_RATIO } from '../ratio';

describe('clampRatio', () => {
  it('returns a mid value unchanged', () => {
    expect(clampRatio(0.6)).toBe(0.6);
  });
  it('clamps below the minimum', () => {
    expect(clampRatio(0.1)).toBe(MIN_RATIO);
  });
  it('clamps above the maximum', () => {
    expect(clampRatio(0.9)).toBe(MAX_RATIO);
  });
  it('exposes sane constants', () => {
    expect(DEFAULT_RATIO).toBe(0.6);
    expect(MIN_RATIO).toBe(0.25);
    expect(MAX_RATIO).toBe(0.75);
  });
});
