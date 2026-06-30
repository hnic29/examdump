import type { Question, QuestionOption, QuestionLink, ParsedQuestion } from '../types';
import { getDb } from './schema';
import { updateBankQuestionCount } from './banks';

interface QuestionRow { id: number; bank_id: number; question_text: string; question_type: string; options: string; correct_answers: string; explanation: string | null; links: string | null; order_index: number; image_data: string | null; }

function toQuestion(r: QuestionRow): Question {
  return {
    id: r.id, bankId: r.bank_id, questionText: r.question_text,
    questionType: r.question_type as Question['questionType'],
    options: JSON.parse(r.options) as QuestionOption[],
    correctAnswers: JSON.parse(r.correct_answers) as string[],
    explanation: r.explanation,
    links: r.links ? JSON.parse(r.links) as QuestionLink[] : null,
    orderIndex: r.order_index,
    imageData: r.image_data,
  };
}

export function insertQuestions(bankId: number, parsed: ParsedQuestion[]): number {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO questions (bank_id, question_text, question_type, options, correct_answers, explanation, links, order_index, image_data) VALUES (?,?,?,?,?,?,?,?,?)');
  db.transaction((qs: ParsedQuestion[]) => {
    qs.forEach((q, i) => stmt.run(bankId, q.question, q.type, JSON.stringify(q.options), JSON.stringify(q.correct_answers), q.explanation ?? null, q.links ? JSON.stringify(q.links) : null, i, q.imageData ?? null));
    updateBankQuestionCount(bankId, qs.length);
  })(parsed);
  return parsed.length;
}

export function getQuestionsForBank(bankId: number): Question[] {
  return (getDb().prepare('SELECT * FROM questions WHERE bank_id = ? ORDER BY order_index').all(bankId) as QuestionRow[]).map(toQuestion);
}

export function updateQuestion(id: number, data: { questionText: string; options: QuestionOption[]; correctAnswers: string[]; explanation: string | null; imageData: string | null }): void {
  getDb().prepare(
    'UPDATE questions SET question_text = ?, options = ?, correct_answers = ?, explanation = ?, image_data = ? WHERE id = ?'
  ).run(data.questionText, JSON.stringify(data.options), JSON.stringify(data.correctAnswers), data.explanation, data.imageData, id);
}
