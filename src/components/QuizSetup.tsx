import React, { useState, useEffect } from 'react';
import type { TimedMode, QuizStartConfig, WaterfallProgress, Question } from '../types';

interface Props {
  bankId: number;
  questionCount: number;
  onStart: (config: QuizStartConfig) => void;
  onCancel: () => void;
}

export function QuizSetup({ bankId, questionCount, onStart, onCancel }: Props) {
  const [callMode, setCallMode] = useState<'normal' | 'waterfall' | 'practice'>('normal');
  const [dailyCount, setDailyCount] = useState('10');
  const [waterfallProgress, setWaterfallProgress] = useState<WaterfallProgress | null>(null);
  const [timedMode, setTimedMode] = useState<TimedMode>('none');
  const [totalMinutes, setTotalMinutes] = useState('90');
  const [perQuestionSeconds, setPerQuestionSeconds] = useState('60');
  const [showAnswerImmediately, setShowAnswerImmediately] = useState(true);
  const [scramble, setScramble] = useState(false);

  // Practice mode state
  const [practiceQuestions, setPracticeQuestions] = useState<Question[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [practiceLoading, setPracticeLoading] = useState(false);

  useEffect(() => {
    window.electronAPI.getWaterfallProgress(bankId).then(setWaterfallProgress);
  }, [bankId]);

  useEffect(() => {
    if (callMode !== 'practice') return;
    setPracticeLoading(true);
    window.electronAPI.loadQuestions(bankId).then(qs => {
      setPracticeQuestions(qs);
      setSelectedIds(new Set(qs.map(q => q.id)));
      setPracticeLoading(false);
    });
  }, [callMode, bankId]);

  const toggleQuestion = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleStart = () => {
    const totalLimit = (timedMode === 'total' || timedMode === 'both')
      ? parseInt(totalMinutes, 10) * 60 : null;
    const perQLimit = (timedMode === 'per_question' || timedMode === 'both')
      ? parseInt(perQuestionSeconds, 10) : null;

    if (totalLimit !== null && !Number.isFinite(totalLimit)) return;
    if (perQLimit !== null && !Number.isFinite(perQLimit)) return;
    if (callMode === 'practice' && selectedIds.size === 0) return;

    const quizMode: QuizStartConfig['quizMode'] =
      callMode === 'waterfall'
        ? { mode: 'waterfall', dailyCount: Math.max(1, parseInt(dailyCount, 10) || 10) }
        : callMode === 'practice'
        ? { mode: 'practice', questionIds: [...selectedIds] }
        : { mode: 'normal' };

    onStart({ timedMode, totalTimeLimit: totalLimit, perQuestionTimeLimit: perQLimit, showAnswerImmediately, quizMode, scramble });
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Quiz Setup</h2>
        <p style={{ color: '#8b9cb0', fontSize: 12, marginBottom: 16 }}>{questionCount} questions</p>

        <div className="form-row">
          <label className="form-label">Call Mode</label>
          <div className="radio-group">
            {([
              ['normal', 'Normal'],
              ['waterfall', 'Waterfall'],
              ['practice', 'Practice'],
            ] as ['normal' | 'waterfall' | 'practice', string][]).map(([val, label]) => (
              <div
                key={val}
                className={`radio-option${callMode === val ? ' selected' : ''}`}
                onClick={() => setCallMode(val)}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${callMode === val ? '#2196f3' : '#4a5568'}`,
                  background: callMode === val ? '#2196f3' : 'transparent',
                  flexShrink: 0,
                  display: 'inline-block',
                }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {callMode === 'waterfall' && (
          <div className="form-row">
            <label className="form-label">Daily questions</label>
            <input
              className="form-input"
              type="number"
              min="1"
              max={questionCount}
              value={dailyCount}
              onChange={e => setDailyCount(e.target.value)}
            />
            {waterfallProgress && waterfallProgress.introducedCount < questionCount && (
              <p style={{ color: '#8b9cb0', fontSize: 11, marginTop: 6 }}>
                {waterfallProgress.introducedCount} of {questionCount} introduced &nbsp;·&nbsp; last session {formatDate(waterfallProgress.lastSessionDate)}
              </p>
            )}
            {waterfallProgress && waterfallProgress.introducedCount >= questionCount && (
              <p style={{ color: '#8b9cb0', fontSize: 11, marginTop: 6 }}>
                All questions introduced — daily full review
              </p>
            )}
          </div>
        )}

        {callMode === 'practice' && (
          <div className="form-row">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0 }}>
                {practiceLoading
                  ? 'Loading questions…'
                  : `${selectedIds.size} of ${practiceQuestions.length} selected`}
              </label>
              {!practiceLoading && practiceQuestions.length > 0 && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '2px 10px', fontSize: 11 }}
                    onClick={() => setSelectedIds(new Set(practiceQuestions.map(q => q.id)))}
                  >
                    All
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '2px 10px', fontSize: 11 }}
                    onClick={() => setSelectedIds(new Set())}
                  >
                    None
                  </button>
                </div>
              )}
            </div>

            {!practiceLoading && (
              <div style={{
                maxHeight: 220,
                overflowY: 'auto',
                border: '1px solid #2d3748',
                borderRadius: 4,
              }}>
                {practiceQuestions.map((q, i) => {
                  const checked = selectedIds.has(q.id);
                  return (
                    <div
                      key={q.id}
                      onClick={() => toggleQuestion(q.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '7px 10px',
                        cursor: 'pointer',
                        borderBottom: i < practiceQuestions.length - 1 ? '1px solid #1e2a3a' : 'none',
                        background: checked ? '#1a2a3e' : 'transparent',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleQuestion(q.id)}
                        onClick={e => e.stopPropagation()}
                        style={{ marginTop: 2, flexShrink: 0 }}
                      />
                      <span style={{ color: '#5a7a9a', fontSize: 11, minWidth: 30, flexShrink: 0 }}>
                        Q{q.orderIndex + 1}
                      </span>
                      <span style={{ fontSize: 12, lineHeight: '1.4', color: checked ? '#e2e8f0' : '#8b9cb0' }}>
                        {q.questionText.length > 120
                          ? q.questionText.slice(0, 120) + '…'
                          : q.questionText}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {!practiceLoading && selectedIds.size === 0 && (
              <p style={{ color: '#e57373', fontSize: 11, marginTop: 6 }}>
                Select at least one question to start.
              </p>
            )}
          </div>
        )}

        <div className="form-row">
          <label className="form-label">Timer</label>
          <div className="radio-group">
            {([
              ['none', 'No timer'],
              ['total', 'Total time limit'],
              ['per_question', 'Per-question time limit'],
              ['both', 'Both'],
            ] as [TimedMode, string][]).map(([val, label]) => (
              <div
                key={val}
                className={`radio-option${timedMode === val ? ' selected' : ''}`}
                onClick={() => setTimedMode(val)}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${timedMode === val ? '#2196f3' : '#4a5568'}`,
                  background: timedMode === val ? '#2196f3' : 'transparent',
                  flexShrink: 0,
                  display: 'inline-block',
                }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {(timedMode === 'total' || timedMode === 'both') && (
          <div className="form-row">
            <label className="form-label">Total time (minutes)</label>
            <input
              className="form-input"
              type="number"
              min="1"
              max="360"
              value={totalMinutes}
              onChange={e => setTotalMinutes(e.target.value)}
            />
          </div>
        )}

        {(timedMode === 'per_question' || timedMode === 'both') && (
          <div className="form-row">
            <label className="form-label">Per-question time (seconds)</label>
            <input
              className="form-input"
              type="number"
              min="10"
              max="300"
              value={perQuestionSeconds}
              onChange={e => setPerQuestionSeconds(e.target.value)}
            />
          </div>
        )}

        <div className="form-row">
          <label className="form-label">Show correct answer after each question?</label>
          <div className="radio-group">
            {([true, false] as const).map(val => (
              <div
                key={String(val)}
                className={`radio-option${showAnswerImmediately === val ? ' selected' : ''}`}
                onClick={() => setShowAnswerImmediately(val)}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${showAnswerImmediately === val ? '#2196f3' : '#4a5568'}`,
                  background: showAnswerImmediately === val ? '#2196f3' : 'transparent',
                  flexShrink: 0,
                  display: 'inline-block',
                }} />
                {val ? 'Yes — show answer and explanation immediately' : 'No — show all results at the end'}
              </div>
            ))}
          </div>
        </div>

        <div className="form-row">
          <label className="form-label">Scramble question order?</label>
          <div className="radio-group">
            {([false, true] as const).map(val => (
              <div
                key={String(val)}
                className={`radio-option${scramble === val ? ' selected' : ''}`}
                onClick={() => setScramble(val)}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${scramble === val ? '#2196f3' : '#4a5568'}`,
                  background: scramble === val ? '#2196f3' : 'transparent',
                  flexShrink: 0,
                  display: 'inline-block',
                }} />
                {val ? 'Yes — randomize order each session' : 'No — original order'}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            className="btn btn-primary"
            onClick={handleStart}
            disabled={callMode === 'practice' && selectedIds.size === 0}
          >
            &#x25B6; Start Quiz
          </button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
