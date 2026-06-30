import React, { useState, useEffect, useReducer, useRef } from 'react';
import { QuizSetup } from './QuizSetup';
import { AnswerFeedback } from './AnswerFeedback';
import { useTimer } from '../hooks/useTimer';
import type { Question, QuizStartConfig, TimedMode, QuizAttempt } from '../types';

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type QuizPhase = 'setup' | 'active' | 'feedback';

interface QuizConfig {
  timedMode: TimedMode;
  totalTimeLimit: number | null;
  perQuestionTimeLimit: number | null;
  showAnswerImmediately: boolean;
  isPractice: boolean;
}

interface StoredResponse {
  questionId: number;
  selectedAnswers: string[];
  isCorrect: boolean;
  timeTaken: number;
}

interface QuizState {
  phase: QuizPhase;
  questions: Question[];
  currentIndex: number;
  selectedAnswers: string[];
  paused: boolean;
  attemptId: number | null;
  config: QuizConfig;
  responses: StoredResponse[];
  lastResponse: StoredResponse | null;
  questionStartTime: number;
}

type QuizAction =
  | { type: 'START'; questions: Question[]; attemptId: number; config: QuizConfig }
  | { type: 'RESUME'; questions: Question[]; attemptId: number; config: QuizConfig; responses: StoredResponse[]; currentIndex: number }
  | { type: 'SELECT'; answers: string[] }
  | { type: 'SUBMIT'; response: StoredResponse; showImmediately: boolean }
  | { type: 'UPDATE_RESPONSE'; index: number; response: StoredResponse; showImmediately: boolean }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'TOGGLE_PAUSE' };

export function reducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'START':
      return { ...state, phase: 'active', questions: action.questions, currentIndex: 0, selectedAnswers: [], paused: false, attemptId: action.attemptId, config: action.config, responses: [], lastResponse: null, questionStartTime: Date.now() };
    case 'RESUME':
      return { ...state, phase: 'active', questions: action.questions, currentIndex: action.currentIndex, selectedAnswers: [], paused: false, attemptId: action.attemptId, config: action.config, responses: action.responses, lastResponse: null, questionStartTime: Date.now() };
    case 'SELECT':
      return { ...state, selectedAnswers: action.answers };
    case 'SUBMIT': {
      const newResponses = [...state.responses, action.response];
      const nextIndex = action.showImmediately ? state.currentIndex : state.currentIndex + 1;
      return {
        ...state,
        phase: action.showImmediately ? 'feedback' : 'active',
        currentIndex: nextIndex,
        selectedAnswers: [],
        responses: newResponses,
        lastResponse: action.response,
        questionStartTime: Date.now(),
      };
    }
    case 'UPDATE_RESPONSE': {
      const updated = [...state.responses];
      updated[action.index] = action.response;
      const nextIdx = action.showImmediately ? state.currentIndex : state.currentIndex + 1;
      return {
        ...state,
        phase: action.showImmediately ? 'feedback' : 'active',
        currentIndex: nextIdx,
        selectedAnswers: !action.showImmediately && updated[nextIdx] ? updated[nextIdx].selectedAnswers : [],
        responses: updated,
        lastResponse: action.response,
        questionStartTime: Date.now(),
      };
    }
    case 'NEXT': {
      const nextIdx = state.currentIndex + 1;
      const existing = state.responses[nextIdx];
      return { ...state, phase: 'active', currentIndex: nextIdx, selectedAnswers: existing ? existing.selectedAnswers : [], lastResponse: null, questionStartTime: Date.now() };
    }
    case 'BACK': {
      const prevIdx = Math.max(0, state.currentIndex - 1);
      const prev = state.responses[prevIdx];
      return { ...state, phase: 'active', currentIndex: prevIdx, selectedAnswers: prev ? prev.selectedAnswers : [], questionStartTime: Date.now() };
    }
    case 'TOGGLE_PAUSE':
      return { ...state, paused: !state.paused };
    default:
      return state;
  }
}

interface Props {
  bankId: number;
  onComplete: (attemptId: number) => void;
  onCancel: () => void;
}

export function ActiveQuiz({ bankId, onComplete, onCancel }: Props) {
  const [state, dispatch] = useReducer(reducer, {
    phase: 'setup',
    questions: [],
    currentIndex: 0,
    selectedAnswers: [],
    paused: false,
    attemptId: null,
    config: { timedMode: 'none', totalTimeLimit: null, perQuestionTimeLimit: null, showAnswerImmediately: true, isPractice: false },
    responses: [],
    lastResponse: null,
    questionStartTime: Date.now(),
  });
  const [questionCount, setQuestionCount] = useState(0);
  const [checkingResume, setCheckingResume] = useState(true);
  const [resumeAttempt, setResumeAttempt] = useState<QuizAttempt | null>(null);
  const [resumeAnswered, setResumeAnswered] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const finishingRef = useRef(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const qs = await window.electronAPI.loadQuestions(bankId);
      if (!cancelled) setQuestionCount(qs.length);
      const active = await window.electronAPI.getActiveAttempt(bankId);
      if (cancelled) return;
      if (active) {
        const saved = await window.electronAPI.getResponses(active.id);
        if (cancelled) return;
        setResumeAttempt(active);
        setResumeAnswered(saved.length);
      }
      setCheckingResume(false);
    })();
    return () => { cancelled = true; };
  }, [bankId]);

  const handleTotalExpire = () => {
    if (state.attemptId && !finishingRef.current) finishQuiz(state.attemptId, state.responses, state.questions);
  };
  const handlePerQExpire = () => {
    if (state.phase !== 'active' || !state.attemptId) return;
    submitAnswer(state.questions[state.currentIndex], []);
  };

  const totalTimer = useTimer(state.config.totalTimeLimit ?? 0, handleTotalExpire);
  const perQTimer = useTimer(state.config.perQuestionTimeLimit ?? 0, handlePerQExpire);

  useEffect(() => {
    if (state.paused || state.phase === 'feedback') {
      perQTimer.pause();
      if (state.paused) totalTimer.pause();
    } else if (state.phase === 'active') {
      totalTimer.resume();
      perQTimer.resume();
    }
  }, [state.paused, state.phase]);

  useEffect(() => {
    if (state.phase === 'active' && state.config.perQuestionTimeLimit) {
      perQTimer.reset(state.config.perQuestionTimeLimit);
      perQTimer.start();
    }
  }, [state.currentIndex, state.phase]);

  const handleContinue = async () => {
    if (!resumeAttempt) return;
    const all = await window.electronAPI.loadQuestions(bankId);
    const questions = all.slice(0, resumeAttempt.totalQuestions);
    const saved = await window.electronAPI.getResponses(resumeAttempt.id);
    const responses: StoredResponse[] = saved.map(r => ({
      questionId: r.questionId,
      selectedAnswers: r.selectedAnswers,
      isCorrect: r.isCorrect,
      timeTaken: r.timeTaken,
    }));
    const { currentIndex, complete } = resumePosition(questions.length, responses.length);
    const config: QuizConfig = {
      timedMode: resumeAttempt.timedMode,
      totalTimeLimit: resumeAttempt.totalTimeLimit,
      perQuestionTimeLimit: resumeAttempt.perQuestionTimeLimit,
      showAnswerImmediately: resumeAttempt.showAnswerImmediately,
      isPractice: false,
    };
    if (complete) {
      finishQuiz(resumeAttempt.id, responses, questions);
      return;
    }
    dispatch({ type: 'RESUME', questions, attemptId: resumeAttempt.id, config, responses, currentIndex });
    if (config.totalTimeLimit) { totalTimer.reset(config.totalTimeLimit); totalTimer.start(); }
  };

  const handleStartNew = async () => {
    if (resumeAttempt) await window.electronAPI.deleteAttempt(resumeAttempt.id);
    setResumeAttempt(null);
  };

  const handleStart = async (cfg: QuizStartConfig) => {
    const allQuestions = await window.electronAPI.loadQuestions(bankId);
    let questions: Question[];

    if (cfg.quizMode.mode === 'waterfall') {
      const progress = await window.electronAPI.advanceWaterfall(
        bankId,
        cfg.quizMode.dailyCount,
        allQuestions.length
      );
      questions = allQuestions.slice(0, progress.introducedCount);
    } else if (cfg.quizMode.mode === 'practice') {
      const ids = new Set(cfg.quizMode.questionIds);
      questions = allQuestions.filter(q => ids.has(q.id));
    } else {
      const from = cfg.quizMode.rangeFrom - 1; // 1-based → 0-based
      const to = cfg.quizMode.rangeTo;
      questions = allQuestions.slice(from, to);
    }

    if (cfg.scramble) questions = fisherYates(questions);

    const attemptId = await window.electronAPI.createAttempt({
      bankId,
      totalQuestions: questions.length,
      timedMode: cfg.timedMode,
      totalTimeLimit: cfg.totalTimeLimit,
      perQuestionTimeLimit: cfg.perQuestionTimeLimit,
      showAnswerImmediately: cfg.showAnswerImmediately,
    });

    dispatch({ type: 'START', questions, attemptId, config: {
      timedMode: cfg.timedMode,
      totalTimeLimit: cfg.totalTimeLimit,
      perQuestionTimeLimit: cfg.perQuestionTimeLimit,
      showAnswerImmediately: cfg.showAnswerImmediately,
      isPractice: cfg.quizMode.mode === 'practice',
    }});

    if (cfg.totalTimeLimit) { totalTimer.reset(cfg.totalTimeLimit); totalTimer.start(); }
  };

  const submitAnswer = async (question: Question, answers: string[]) => {
    if (!state.attemptId || submittingRef.current) return;
    submittingRef.current = true;
    const elapsed = Math.floor((Date.now() - state.questionStartTime) / 1000);
    const isInteractive = question.questionType === 'interactive';
    // Interactive questions are never graded and never show the answer feedback screen.
    const isCorrect = isInteractive ? false : arraysMatchSorted([...answers].sort(), [...question.correctAnswers].sort());
    const showImmediately = !isInteractive && state.config.showAnswerImmediately && !state.config.isPractice;
    const response: StoredResponse = { questionId: question.id, selectedAnswers: answers, isCorrect, timeTaken: elapsed };
    const isRevisit = state.currentIndex < state.responses.length;

    try {
      if (isRevisit) {
        await window.electronAPI.updateResponse({ attemptId: state.attemptId, questionId: question.id, selectedAnswers: answers, isCorrect, timeTaken: elapsed });
        dispatch({ type: 'UPDATE_RESPONSE', index: state.currentIndex, response, showImmediately });
        const updatedResponses = [...state.responses];
        updatedResponses[state.currentIndex] = response;
        const isLast = state.currentIndex >= state.questions.length - 1;
        if (!showImmediately && isLast) {
          finishQuiz(state.attemptId, updatedResponses, state.questions);
        }
      } else {
        await window.electronAPI.saveResponse({ attemptId: state.attemptId, questionId: question.id, selectedAnswers: answers, isCorrect, timeTaken: elapsed });
        dispatch({ type: 'SUBMIT', response, showImmediately });
        const newResponses = [...state.responses, response];
        const isLast = state.currentIndex >= state.questions.length - 1;
        if (!showImmediately && isLast) {
          finishQuiz(state.attemptId, newResponses, state.questions);
        }
      }
    } finally {
      submittingRef.current = false;
    }
  };

  const handleNext = () => {
    setShowExplanation(false);
    const isLast = state.currentIndex >= state.questions.length - 1;
    const allAnswered = state.responses.length >= state.questions.length;
    if (isLast && allAnswered) finishQuiz(state.attemptId!, state.responses, state.questions);
    else dispatch({ type: 'NEXT' });
  };

  const finishQuiz = async (attemptId: number, responses: StoredResponse[], questions: Question[]) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    // Interactive questions are excluded from scoring.
    const scorable = questions.filter(q => q.questionType !== 'interactive');
    const correctCount = responses.filter(r => {
      const q = questions.find(q2 => q2.id === r.questionId);
      return q && q.questionType !== 'interactive' && r.isCorrect;
    }).length;
    const score = scorable.length > 0 ? (correctCount / scorable.length) * 100 : 0;
    await window.electronAPI.completeAttempt({ attemptId, correctCount, score });
    onComplete(attemptId);
  };

  const handleSelectAnswer = (optId: string) => {
    const q = state.questions[state.currentIndex];
    if (!q) return;
    if (q.questionType === 'multi_select') {
      const current = state.selectedAnswers;
      const next = current.includes(optId) ? current.filter(a => a !== optId) : [...current, optId];
      dispatch({ type: 'SELECT', answers: next });
    } else {
      dispatch({ type: 'SELECT', answers: [optId] });
    }
  };

  const openLink = async (url: string) => {
    if (!state.paused) dispatch({ type: 'TOGGLE_PAUSE' });
    await window.electronAPI.openPanel(url);
  };

  if (checkingResume) {
    return <div style={{ color: '#8b9cb0' }}>Loading…</div>;
  }

  if (state.phase === 'setup' && resumeAttempt) {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h2>Unfinished quiz</h2>
          <p style={{ color: '#8b9cb0', fontSize: 13, marginBottom: 20 }}>
            You answered {resumeAnswered} of {resumeAttempt.totalQuestions} questions. Pick up where you left off?
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleContinue}>▶ Continue</button>
            <button className="btn btn-secondary" onClick={handleStartNew}>↻ Start New</button>
            <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === 'setup') {
    return <QuizSetup bankId={bankId} questionCount={questionCount} onStart={handleStart} onCancel={onCancel} />;
  }

  const isComplete = state.currentIndex >= state.questions.length;
  if (isComplete) return <div style={{ color: '#8b9cb0' }}>Finishing…</div>;

  const question = state.questions[state.currentIndex];
  const isRevisit = state.currentIndex < state.responses.length;
  const totalSecs = state.config.totalTimeLimit;
  const perQSecs = state.config.perQuestionTimeLimit;

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: '#8b9cb0', fontSize: 12 }}>
          Question {state.currentIndex + 1} of {state.questions.length} &nbsp;·&nbsp; {state.responses.filter(r => r.isCorrect).length} correct
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {totalSecs && (
            <span style={{ fontFamily: 'monospace', color: totalTimer.secondsLeft < 300 ? '#f44336' : '#ff9800', fontWeight: 700 }}>
              ⏱ {fmt(totalTimer.secondsLeft)}
            </span>
          )}
          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => dispatch({ type: 'TOGGLE_PAUSE' })}>
            {state.paused ? '▶ Resume' : '⏸ Pause'}
          </button>
        </div>
      </div>

      {/* Per-question timer bar */}
      {perQSecs && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#8b9cb0', fontSize: 10 }}>Per Q:</span>
          <div style={{ flex: 1, height: 4, background: '#2d3a52', borderRadius: 2 }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: perQTimer.secondsLeft / perQSecs > 0.4 ? '#4caf50' : perQTimer.secondsLeft / perQSecs > 0.2 ? '#ff9800' : '#f44336',
              width: `${Math.max(0, (perQTimer.secondsLeft / perQSecs) * 100)}%`,
              transition: 'width 1s linear',
            }} />
          </div>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#8b9cb0' }}>{perQTimer.secondsLeft}s</span>
        </div>
      )}

      {/* Progress bar */}
      <div style={{ height: 3, background: '#1e2535', borderRadius: 2, marginBottom: 16 }}>
        <div style={{ height: '100%', background: '#2196f3', borderRadius: 2, width: `${(state.currentIndex / state.questions.length) * 100}%` }} />
      </div>

      {/* Pause overlay */}
      {state.paused && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, cursor: 'pointer' }} onClick={() => dispatch({ type: 'TOGGLE_PAUSE' })}>
          <div style={{ textAlign: 'center', color: '#e0e0e0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏸</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Paused</div>
            <div style={{ fontSize: 13, color: '#8b9cb0', marginTop: 6 }}>Click anywhere to resume</div>
          </div>
        </div>
      )}

      {state.phase === 'feedback' && state.lastResponse ? (
        <AnswerFeedback
          question={question}
          response={{
            id: 0,
            attemptId: state.attemptId!,
            questionId: state.lastResponse.questionId,
            selectedAnswers: state.lastResponse.selectedAnswers,
            isCorrect: state.lastResponse.isCorrect,
            timeTaken: state.lastResponse.timeTaken,
          }}
          onNext={handleNext}
          onOpenLink={openLink}
        />
      ) : question.questionType === 'interactive' ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <span className="badge badge-interactive">Interactive · Unscored</span>
          </div>
          <p style={{ fontSize: 19, lineHeight: 1.6, marginBottom: 18 }}>{question.questionText}</p>
          {question.imageData && (
            <img
              src={question.imageData}
              alt="Interactive question scenario"
              style={{ maxWidth: '100%', borderRadius: 6, border: '1px solid #2d3a52', marginBottom: 18 }}
            />
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
            {state.currentIndex > 0 && (
              <button className="btn btn-secondary" onClick={() => dispatch({ type: 'BACK' })}>← Back</button>
            )}
            <button className="btn btn-primary" onClick={() => submitAnswer(question, [])}>Continue →</button>
          </div>
        </>
      ) : state.config.isPractice ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <span className={`badge ${question.questionType === 'true_false' ? 'badge-tf' : question.questionType === 'multi_select' ? 'badge-ms' : 'badge-mc'}`}>
              {question.questionType === 'multiple_choice' ? 'Multiple Choice' : question.questionType === 'true_false' ? 'True / False' : 'Select All That Apply'}
            </span>
          </div>
          <p style={{ fontSize: 19, lineHeight: 1.6, marginBottom: 18 }}>{question.questionText}</p>
          {question.imageData && (
            <img
              src={question.imageData}
              alt="Question image"
              style={{ maxWidth: '100%', borderRadius: 6, border: '1px solid #2d3a52', marginBottom: 18 }}
            />
          )}
          {question.options.map(opt => {
            const isCorrect = question.correctAnswers.includes(opt.id);
            return (
              <div key={opt.id} style={{ display: 'flex', gap: 12, padding: '13px 15px', borderRadius: 6, border: `1px solid ${isCorrect ? '#4caf50' : '#2d3a52'}`, background: isCorrect ? '#4caf5018' : '#1a1f2e', marginBottom: 8 }}>
                <div style={{ width: 27, height: 27, borderRadius: 4, background: isCorrect ? '#4caf50' : '#2d3a52', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{opt.id}</div>
                <div style={{ fontSize: 16, lineHeight: 1.5, paddingTop: 3, color: isCorrect ? '#c9d4e8' : '#8b9cb0' }}>{opt.text}</div>
              </div>
            );
          })}
          {question.explanation && (
            <div style={{ marginTop: 14, marginBottom: 12 }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: '4px 12px' }}
                onClick={() => setShowExplanation(e => !e)}
              >
                {showExplanation ? 'Hide Explanation' : 'Explanation'}
              </button>
              {showExplanation && (
                <div style={{ borderLeft: '3px solid #4caf50', background: '#1e2535', borderRadius: '0 6px 6px 0', padding: '10px 14px', marginTop: 8, maxHeight: 180, overflowY: 'auto' }}>
                  <div style={{ fontSize: 15, color: '#c9d4e8', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{question.explanation}</div>
                </div>
              )}
            </div>
          )}
          {question.links && question.links.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {question.links.map((link, i) => (
                <button key={i} className="btn btn-secondary" style={{ marginRight: 6, marginBottom: 4, fontSize: 11 }} onClick={() => openLink(link.url)}>
                  🔗 {link.text.slice(0, 50)}
                </button>
              ))}
            </div>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
            {state.currentIndex > 0 && (
              <button className="btn btn-secondary" onClick={() => { setShowExplanation(false); dispatch({ type: 'BACK' }); }}>← Back</button>
            )}
            <button className="btn btn-primary" onClick={() => { setShowExplanation(false); submitAnswer(question, question.correctAnswers); }}>
              {state.currentIndex >= state.questions.length - 1 ? 'Finish' : 'Next →'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <span className={`badge ${question.questionType === 'true_false' ? 'badge-tf' : question.questionType === 'multi_select' ? 'badge-ms' : 'badge-mc'}`}>
              {question.questionType === 'multiple_choice' ? 'Multiple Choice' : question.questionType === 'true_false' ? 'True / False' : 'Select All That Apply'}
            </span>
          </div>
          <p style={{ fontSize: 19, lineHeight: 1.6, marginBottom: 18 }}>{question.questionText}</p>
          {question.imageData && (
            <img
              src={question.imageData}
              alt="Question image"
              style={{ maxWidth: '100%', borderRadius: 6, border: '1px solid #2d3a52', marginBottom: 18 }}
            />
          )}
          {question.questionType === 'multi_select' && (
            <p style={{ fontSize: 13, color: '#8b9cb0', marginBottom: 10 }}>Select all that apply</p>
          )}
          {question.options.map(opt => {
            const sel = state.selectedAnswers.includes(opt.id);
            return (
              <div key={opt.id} onClick={() => handleSelectAnswer(opt.id)} style={{ display: 'flex', gap: 12, padding: '13px 15px', borderRadius: 6, border: `1px solid ${sel ? '#2196f3' : '#2d3a52'}`, background: sel ? '#2196f320' : '#1a1f2e', marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ width: 27, height: 27, borderRadius: 4, background: sel ? '#2196f3' : '#2d3a52', color: sel ? '#fff' : '#8b9cb0', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{opt.id}</div>
                <div style={{ fontSize: 16, lineHeight: 1.5, paddingTop: 3 }}>{opt.text}</div>
              </div>
            );
          })}
          <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
            {state.currentIndex > 0 && (
              <button className="btn btn-secondary" onClick={() => dispatch({ type: 'BACK' })}>
                ← Back
              </button>
            )}
            <button className="btn btn-primary" disabled={state.selectedAnswers.length === 0} onClick={() => submitAnswer(question, state.selectedAnswers)}>
              {isRevisit ? 'Update →' : 'Submit →'}
            </button>
            {isRevisit && (
              <button className="btn btn-secondary" onClick={handleNext}>
                Skip →
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function arraysMatchSorted(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function resumePosition(totalQuestions: number, responseCount: number): { currentIndex: number; complete: boolean } {
  if (responseCount >= totalQuestions) return { currentIndex: totalQuestions, complete: true };
  return { currentIndex: responseCount, complete: false };
}
