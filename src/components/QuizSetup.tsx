import React, { useState } from 'react';
import type { TimedMode, CreateAttemptInput } from '../types';

interface Props {
  bankId: number;
  questionCount: number;
  onStart: (config: Omit<CreateAttemptInput, 'bankId' | 'totalQuestions'>) => void;
  onCancel: () => void;
}

export function QuizSetup({ bankId, questionCount, onStart, onCancel }: Props) {
  const [timedMode, setTimedMode] = useState<TimedMode>('none');
  const [totalMinutes, setTotalMinutes] = useState('90');
  const [perQuestionSeconds, setPerQuestionSeconds] = useState('60');
  const [showAnswerImmediately, setShowAnswerImmediately] = useState(true);

  const handleStart = () => {
    onStart({
      timedMode,
      totalTimeLimit: (timedMode === 'total' || timedMode === 'both') ? parseInt(totalMinutes, 10) * 60 : null,
      perQuestionTimeLimit: (timedMode === 'per_question' || timedMode === 'both') ? parseInt(perQuestionSeconds, 10) : null,
      showAnswerImmediately,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Quiz Setup</h2>
        <p style={{ color: '#8b9cb0', fontSize: 12, marginBottom: 16 }}>{questionCount} questions</p>

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

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-primary" onClick={handleStart}>&#x25B6; Start Quiz</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
