import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, getDb } from '../schema';
import { createBank, getAllBanks } from '../banks';
import { getWaterfallProgress, advanceWaterfall } from '../waterfall';
import { createAttempt, completeAttempt } from '../attempts';

beforeEach(() => { initDb(':memory:'); });

function seedCompletedAttempt(bankId: number, totalQuestions: number): void {
  const id = createAttempt({ bankId, timedMode: 'none', totalTimeLimit: null, perQuestionTimeLimit: null, showAnswerImmediately: true, totalQuestions });
  completeAttempt({ attemptId: id, correctCount: totalQuestions, score: 100 });
}

describe('getWaterfallProgress', () => {
  it('returns null when no record exists', () => {
    expect(getWaterfallProgress(999)).toBeNull();
  });

  it('returns the stored progress when a record exists', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 20, '2026-01-01');
    const p = getWaterfallProgress(bank.id);
    expect(p).not.toBeNull();
    expect(p!.introducedCount).toBe(20);
    expect(p!.lastSessionDate).toBe('2026-01-01');
    expect(p!.bankId).toBe(bank.id);
  });
});

describe('advanceWaterfall', () => {
  it('inserts a new record on first call', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    const result = advanceWaterfall(bank.id, 10, 100);
    expect(result.introducedCount).toBe(10);
    expect(result.bankId).toBe(bank.id);
    expect(typeof result.lastSessionDate).toBe('string');
  });

  it('caps introducedCount at totalQuestions on first call', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    const result = advanceWaterfall(bank.id, 50, 30);
    expect(result.introducedCount).toBe(30);
  });

  it('returns unchanged record when called twice on the same day', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    const first = advanceWaterfall(bank.id, 10, 100);
    const second = advanceWaterfall(bank.id, 10, 100);
    expect(second.introducedCount).toBe(first.introducedCount);
    expect(second.lastSessionDate).toBe(first.lastSessionDate);
  });

  it('advances introducedCount on a new day when the batch was completed', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 10, '2020-01-01');
    seedCompletedAttempt(bank.id, 10);
    const result = advanceWaterfall(bank.id, 5, 100);
    expect(result.introducedCount).toBe(15);
  });

  it('caps at totalQuestions when advancing would exceed it', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 95, '2020-01-01');
    seedCompletedAttempt(bank.id, 95);
    const result = advanceWaterfall(bank.id, 10, 100);
    expect(result.introducedCount).toBe(100);
  });

  it('stays at totalQuestions when all questions already introduced', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 100, '2020-01-01');
    const result = advanceWaterfall(bank.id, 10, 100);
    expect(result.introducedCount).toBe(100);
  });

  it('does NOT advance on a new day when the batch was not completed', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 10, '2020-01-01');
    const result = advanceWaterfall(bank.id, 5, 100);
    expect(result.introducedCount).toBe(10);
    expect(result.lastSessionDate).not.toBe('2020-01-01');
  });

  it('does NOT advance when only an incomplete attempt exists at the introduced count', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 10, '2020-01-01');
    createAttempt({ bankId: bank.id, timedMode: 'none', totalTimeLimit: null, perQuestionTimeLimit: null, showAnswerImmediately: true, totalQuestions: 10 });
    const result = advanceWaterfall(bank.id, 5, 100);
    expect(result.introducedCount).toBe(10);
  });

  it('does NOT advance when a completed attempt has a different question count', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 10, '2020-01-01');
    seedCompletedAttempt(bank.id, 7);
    const result = advanceWaterfall(bank.id, 5, 100);
    expect(result.introducedCount).toBe(10);
  });
});
