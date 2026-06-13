import type { QuestionResponse, SaveResponseInput } from '../types';
import { getDb } from './schema';

interface ResponseRow { id: number; attempt_id: number; question_id: number; selected_answers: string; is_correct: number; time_taken: number; }

function toResponse(r: ResponseRow): QuestionResponse {
  return { id: r.id, attemptId: r.attempt_id, questionId: r.question_id, selectedAnswers: JSON.parse(r.selected_answers) as string[], isCorrect: r.is_correct === 1, timeTaken: r.time_taken };
}

export function saveResponse(input: SaveResponseInput): void {
  getDb().prepare('INSERT INTO question_responses (attempt_id, question_id, selected_answers, is_correct, time_taken) VALUES (?,?,?,?,?) ON CONFLICT(attempt_id, question_id) DO UPDATE SET selected_answers=excluded.selected_answers, is_correct=excluded.is_correct, time_taken=excluded.time_taken').run(input.attemptId, input.questionId, JSON.stringify(input.selectedAnswers), input.isCorrect ? 1 : 0, input.timeTaken);
}

export function getResponsesForAttempt(attemptId: number): QuestionResponse[] {
  return (getDb().prepare('SELECT * FROM question_responses WHERE attempt_id = ? ORDER BY id').all(attemptId) as ResponseRow[]).map(toResponse);
}
