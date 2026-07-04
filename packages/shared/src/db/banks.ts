import type { QuestionBank } from '../types';
import { getDb } from './schema';

interface BankRow { id: number; name: string; source_file: string; created_at: number; question_count: number; }

function toBank(r: BankRow): QuestionBank {
  return { id: r.id, name: r.name, sourceFile: r.source_file, createdAt: r.created_at, questionCount: r.question_count };
}

export function createBank(name: string, sourceFile: string): QuestionBank {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const result = db.prepare('INSERT INTO question_banks (name, source_file, created_at, question_count) VALUES (?,?,?,0)').run(name, sourceFile, now);
  return toBank(db.prepare('SELECT * FROM question_banks WHERE id = ?').get(result.lastInsertRowid) as BankRow);
}

export function getAllBanks(): QuestionBank[] {
  return (getDb().prepare('SELECT * FROM question_banks ORDER BY created_at DESC').all() as BankRow[]).map(toBank);
}

export function deleteBank(id: number): void {
  getDb().prepare('DELETE FROM question_banks WHERE id = ?').run(id);
}

export function updateBankQuestionCount(bankId: number, count: number): void {
  getDb().prepare('UPDATE question_banks SET question_count = ? WHERE id = ?').run(count, bankId);
}

export function getBankStats(bankId: number): { bestScore: number | null; lastTaken: number | null } {
  const row = getDb().prepare('SELECT MAX(score) as best_score, MAX(started_at) as last_taken FROM quiz_attempts WHERE bank_id = ? AND completed_at IS NOT NULL').get(bankId) as { best_score: number | null; last_taken: number | null };
  return { bestScore: row.best_score, lastTaken: row.last_taken };
}
