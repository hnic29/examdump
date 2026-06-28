import React, { useState, useEffect } from 'react';
import type { TimedMode, QuizStartConfig, WaterfallProgress } from '../types';

interface Props {
  bankId: number;
  questionCount: number;
  onStart: (config: QuizStartConfig) => void;
  onCancel: () => void;
}

export function QuizSetup({ bankId, questionCount, onStart, onCancel }: Props) {
  const [callMode, setCallMode] = useState<'normal' | 'waterfall'>('normal');
  const [dailyCount, setDailyCount] = useState('10');
  const [waterfallProgress, setWaterfallProgress] = useState<WaterfallProgress | null>(null);
  const [timedMode, setTimedMode] = useState<TimedMode>('none');
  const [totalMinutes, setTotalMinutes] = useState('90');
  const [perQuestionSeconds, setPerQuestionSeconds] = useState('60');
  const [showAnswerImmediately, setShowAnswerImmediately] = useState(true);
  const [scramble, setScramble] = useState(false);

  useEffect(() => {
    window.electronAPI.getWaterfallProgress(bankId).then(setWaterfallProgress);
  }, [bankId]);

  const handleStart = () => {
    const totalLimit = (timedMode === 'total' || timedMode === 'both')
      ? parseInt(totalMinutes, 10) * 60 : null;
    const perQLimit = (timedMode === 'per_question' || timedMode === 'both')
      ? parseInt(perQuestionSeconds, 10) : null;

    if (totalLimit !== null && !Number.isFinite(totalLimit)) return;
    if (perQLimit !== null && !Number.isFinite(perQLimit)) return;

    const quizMode: QuizStartConfig['quizMode'] = callMode === 'waterfall'
      ? { mode: 'waterfall', dailyCount: Math.max(1, parseInt(dailyCount, 10) || 10) }
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
            {(['normal', 'waterfall'] as const).map(val => (
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
                {val === 'normal' ? 'Normal' : 'Waterfall'}
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
          <button className="btn btn-primary" onClick={handleStart}>&#x25B6; Start Quiz</button>
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
