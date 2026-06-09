import { describe, it, expect } from 'vitest';
import { toJsonFileName } from '../filename';

describe('toJsonFileName', () => {
  it('appends .json to a plain name', () => {
    expect(toJsonFileName('CY0-001')).toBe('CY0-001.json');
  });

  it('replaces an existing extension with .json', () => {
    expect(toJsonFileName('CY0-001.pdf')).toBe('CY0-001.json');
  });

  it('falls back to a default for empty input', () => {
    expect(toJsonFileName('')).toBe('examdump-questions.json');
    expect(toJsonFileName('   ')).toBe('examdump-questions.json');
  });

  it('replaces filesystem-unsafe characters', () => {
    expect(toJsonFileName('a/b:c*?')).toBe('a_b_c__.json');
  });
});
