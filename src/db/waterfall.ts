import type { WaterfallProgress } from '../types';
import { getDb } from './schema';

interface WaterfallRow {
  bank_id: number;
  introduced_count: number;
  last_session_date: string;
}

function toProgress(r: WaterfallRow): WaterfallProgress {
  return {
    bankId: r.bank_id,
    introducedCount: r.introduced_count,
    lastSessionDate: r.last_session_date,
  };
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getWaterfallProgress(bankId: number): WaterfallProgress | null {
  const row = getDb()
    .prepare('SELECT * FROM waterfall_progress WHERE bank_id = ?')
    .get(bankId) as WaterfallRow | undefined;
  return row ? toProgress(row) : null;
}

export function advanceWaterfall(bankId: number, dailyCount: number, totalQuestions: number): WaterfallProgress {
  const today = todayISO();
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM waterfall_progress WHERE bank_id = ?')
    .get(bankId) as WaterfallRow | undefined;

  if (!existing) {
    const introducedCount = Math.min(dailyCount, totalQuestions);
    db.prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bankId, introducedCount, today);
    return { bankId, introducedCount, lastSessionDate: today };
  }

  if (existing.last_session_date === today) {
    return toProgress(existing);
  }

  const newIntroduced = Math.min(existing.introduced_count + dailyCount, totalQuestions);
  db.prepare(
    'UPDATE waterfall_progress SET introduced_count = ?, last_session_date = ? WHERE bank_id = ?'
  ).run(newIntroduced, today, bankId);
  return { bankId, introducedCount: newIntroduced, lastSessionDate: today };
}
