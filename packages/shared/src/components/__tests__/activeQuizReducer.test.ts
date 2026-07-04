import { describe, it, expect } from 'vitest';
import { reducer, resumePosition } from '../ActiveQuiz';
import type { Question } from '../../types';

const baseConfig = { timedMode: 'none' as const, totalTimeLimit: null, perQuestionTimeLimit: null, showAnswerImmediately: true };
const baseState = {
  phase: 'active' as const, questions: [] as Question[], currentIndex: 0, selectedAnswers: [],
  paused: false, attemptId: 1, config: baseConfig, responses: [], lastResponse: null, questionStartTime: Date.now(),
};

describe('reducer', () => {
  it('SELECT updates selectedAnswers', () => {
    const next = reducer(baseState, { type: 'SELECT', answers: ['A', 'B'] });
    expect(next.selectedAnswers).toEqual(['A', 'B']);
  });

  it('SUBMIT with showImmediately=true goes to feedback, keeps index', () => {
    const response = { questionId: 1, selectedAnswers: ['A'], isCorrect: true, timeTaken: 5 };
    const next = reducer({ ...baseState, config: { ...baseConfig, showAnswerImmediately: true } }, { type: 'SUBMIT', response, showImmediately: true });
    expect(next.phase).toBe('feedback');
    expect(next.currentIndex).toBe(0);
    expect(next.responses).toHaveLength(1);
  });

  it('SUBMIT with showImmediately=false advances index', () => {
    const response = { questionId: 1, selectedAnswers: ['A'], isCorrect: false, timeTaken: 3 };
    const next = reducer({ ...baseState, config: { ...baseConfig, showAnswerImmediately: false } }, { type: 'SUBMIT', response, showImmediately: false });
    expect(next.phase).toBe('active');
    expect(next.currentIndex).toBe(1);
  });

  it('NEXT advances index and resets to active', () => {
    const state = { ...baseState, phase: 'feedback' as const, currentIndex: 2 };
    const next = reducer(state, { type: 'NEXT' });
    expect(next.phase).toBe('active');
    expect(next.currentIndex).toBe(3);
    expect(next.selectedAnswers).toEqual([]);
  });

  it('TOGGLE_PAUSE flips paused', () => {
    expect(reducer(baseState, { type: 'TOGGLE_PAUSE' }).paused).toBe(true);
    expect(reducer({ ...baseState, paused: true }, { type: 'TOGGLE_PAUSE' }).paused).toBe(false);
  });
});

describe('resumePosition', () => {
  it('returns the next unanswered index mid-quiz', () => {
    expect(resumePosition(10, 4)).toEqual({ currentIndex: 4, complete: false });
  });
  it('marks complete when all questions answered', () => {
    expect(resumePosition(10, 10)).toEqual({ currentIndex: 10, complete: true });
  });
  it('marks complete when response count exceeds total', () => {
    expect(resumePosition(10, 11)).toEqual({ currentIndex: 10, complete: true });
  });
});

describe('RESUME action', () => {
  it('enters active phase with the provided index and responses', () => {
    const responses = [{ questionId: 1, selectedAnswers: ['A'], isCorrect: true, timeTaken: 5 }];
    const next = reducer(baseState, { type: 'RESUME', questions: [], attemptId: 7, config: baseConfig, responses, currentIndex: 1 });
    expect(next.phase).toBe('active');
    expect(next.currentIndex).toBe(1);
    expect(next.attemptId).toBe(7);
    expect(next.responses).toHaveLength(1);
  });
});
