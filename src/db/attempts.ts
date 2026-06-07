import type { QuizAttempt, CreateAttemptInput, CompleteAttemptInput, TimedMode } from '../types';
import { getDb } from './schema';

interface AttemptRow { id: number; bank_id: number; started_at: number; completed_at: number | null; timed_mode: string; total_time_limit: number | null; per_question_time_limit: number | null; show_answer_immediately: number; score: number | null; total_questions: number; correct_count: number; }

function toAttempt(r: AttemptRow): QuizAttempt {
  return {
    id: r.id, bankId: r.bank_id, startedAt: r.started_at, completedAt: r.completed_at,
    timedMode: r.timed_mode as TimedMode,
    totalTimeLimit: r.total_time_limit, perQuestionTimeLimit: r.per_question_time_limit,
    showAnswerImmediately: r.show_answer_immediately === 1,
    score: r.score, totalQuestions: r.total_questions, correctCount: r.correct_count,
  };
}

export function createAttempt(input: CreateAttemptInput): number {
  const result = getDb().prepare('INSERT INTO quiz_attempts (bank_id, started_at, timed_mode, total_time_limit, per_question_time_limit, show_answer_immediately, total_questions, correct_count) VALUES (?,?,?,?,?,?,?,0)').run(input.bankId, Math.floor(Date.now() / 1000), input.timedMode, input.totalTimeLimit ?? null, input.perQuestionTimeLimit ?? null, input.showAnswerImmediately ? 1 : 0, input.totalQuestions);
  return Number(result.lastInsertRowid);
}

export function completeAttempt(input: CompleteAttemptInput): void {
  getDb().prepare('UPDATE quiz_attempts SET completed_at = ?, correct_count = ?, score = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), input.correctCount, input.score, input.attemptId);
}

export function getAttemptsForBank(bankId: number): QuizAttempt[] {
  return (getDb().prepare('SELECT * FROM quiz_attempts WHERE bank_id = ? ORDER BY started_at DESC').all(bankId) as AttemptRow[]).map(toAttempt);
}

export function getAttemptById(attemptId: number): QuizAttempt | null {
  const row = getDb().prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(attemptId) as AttemptRow | undefined;
  return row ? toAttempt(row) : null;
}

export function getActiveAttempt(bankId: number): QuizAttempt | null {
  const row = getDb().prepare(
    'SELECT * FROM quiz_attempts WHERE bank_id = ? AND completed_at IS NULL ORDER BY started_at DESC, id DESC LIMIT 1'
  ).get(bankId) as AttemptRow | undefined;
  return row ? toAttempt(row) : null;
}

export function deleteAttempt(attemptId: number): void {
  getDb().prepare('DELETE FROM quiz_attempts WHERE id = ?').run(attemptId);
}
