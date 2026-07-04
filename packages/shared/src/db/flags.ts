import type { FlaggedQuestion } from '../types';
import { getDb } from './schema';

export function flagQuestion(questionId: number): void {
  getDb().prepare(
    'INSERT OR REPLACE INTO question_flags (question_id, flagged_at) VALUES (?, ?)'
  ).run(questionId, Math.floor(Date.now() / 1000));
}

export function unflagQuestion(questionId: number): void {
  getDb().prepare('DELETE FROM question_flags WHERE question_id = ?').run(questionId);
}

export function getFlaggedForBank(bankId: number): FlaggedQuestion[] {
  return (getDb().prepare(`
    SELECT q.id AS questionId, q.question_text AS questionText, q.order_index AS orderIndex, f.flagged_at AS flaggedAt
    FROM question_flags f
    JOIN questions q ON q.id = f.question_id
    WHERE q.bank_id = ?
    ORDER BY q.order_index
  `).all(bankId) as FlaggedQuestion[]);
}
