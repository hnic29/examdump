import { describe, it, expect } from 'vitest';
import { formatClock } from '../StatusBar';

describe('formatClock', () => {
  it('formats a date as weekday, month day, year · h:mm:ss AM/PM', () => {
    const d = new Date(2026, 5, 7, 17, 42, 18);
    const out = formatClock(d);
    expect(out).toContain('Jun');
    expect(out).toContain('2026');
    expect(out).toContain('7');
    expect(out).toMatch(/\d{1,2}:42:18/);
    expect(out).toContain('PM');
    expect(out).toContain('·');
  });
});
