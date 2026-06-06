import { describe, it, expect, beforeEach } from 'vitest';
import { initDb } from '../schema';
import { createBank, getAllBanks, deleteBank, getBankStats } from '../banks';
import { insertQuestions, getQuestionsForBank } from '../questions';
import { createAttempt, completeAttempt, getAttemptsForBank } from '../attempts';
import { saveResponse, getResponsesForAttempt } from '../responses';

beforeEach(() => { initDb(':memory:'); });

describe('banks', () => {
  it('creates and retrieves a bank', () => {
    createBank('Network+', 'net.pdf');
    const banks = getAllBanks();
    expect(banks).toHaveLength(1);
    expect(banks[0].name).toBe('Network+');
    expect(banks[0].sourceFile).toBe('net.pdf');
    expect(banks[0].questionCount).toBe(0);
  });

  it('deletes a bank', () => {
    createBank('Net+', 'n.pdf');
    const [bank] = getAllBanks();
    deleteBank(bank.id);
    expect(getAllBanks()).toHaveLength(0);
  });
});

describe('questions', () => {
  it('inserts questions and updates bank count', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    insertQuestions(bank.id, [
      { question: 'Q1', type: 'multiple_choice', options: [{ id: 'A', text: 'Ans' }], correct_answers: ['A'], explanation: null, links: null },
    ]);
    const qs = getQuestionsForBank(bank.id);
    expect(qs).toHaveLength(1);
    expect(qs[0].questionText).toBe('Q1');
    expect(getAllBanks()[0].questionCount).toBe(1);
  });
});

describe('attempts', () => {
  it('creates and completes an attempt', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    const attemptId = createAttempt({ bankId: bank.id, timedMode: 'none', totalTimeLimit: null, perQuestionTimeLimit: null, showAnswerImmediately: true, totalQuestions: 5 });
    expect(typeof attemptId).toBe('number');
    completeAttempt({ attemptId, correctCount: 4, score: 80 });
    const attempts = getAttemptsForBank(bank.id);
    expect(attempts[0].score).toBe(80);
    expect(attempts[0].correctCount).toBe(4);
    expect(attempts[0].completedAt).not.toBeNull();
  });
});

describe('responses', () => {
  it('saves and retrieves a response', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    insertQuestions(bank.id, [
      { question: 'Q', type: 'multiple_choice', options: [{ id: 'A', text: 'x' }], correct_answers: ['A'], explanation: null, links: null },
    ]);
    const [q] = getQuestionsForBank(bank.id);
    const attemptId = createAttempt({ bankId: bank.id, timedMode: 'none', totalTimeLimit: null, perQuestionTimeLimit: null, showAnswerImmediately: false, totalQuestions: 1 });
    saveResponse({ attemptId, questionId: q.id, selectedAnswers: ['A'], isCorrect: true, timeTaken: 12 });
    const responses = getResponsesForAttempt(attemptId);
    expect(responses[0].isCorrect).toBe(true);
    expect(responses[0].timeTaken).toBe(12);
  });
});
