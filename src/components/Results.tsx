import React, { useEffect, useState } from 'react';
import type { Question, QuestionResponse, QuizAttempt } from '../types';

interface Props {
  attemptId: number;
  bankId: number;
  onRetake: () => void;
  onBack: () => void;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60); return `${m}m ${s % 60}s`;
}

export function Results({ attemptId, bankId, onRetake, onBack }: Props) {
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<QuestionResponse[]>([]);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    (async () => {
      const [attempts, qs, resps] = await Promise.all([
        window.electronAPI.getHistory(bankId),
        window.electronAPI.loadQuestions(bankId),
        window.electronAPI.getResponses(attemptId),
      ]);
      setAttempt(attempts.find(a => a.id === attemptId) ?? null);
      setQuestions(qs);
      setResponses(resps);
    })();
  }, [attemptId, bankId]);

  if (!attempt) return <div style={{ color: '#8b9cb0' }}>Loading…</div>;

  const elapsed = attempt.completedAt && attempt.startedAt ? attempt.completedAt - attempt.startedAt : null;
  const scoreColor = (attempt.score ?? 0) >= 70 ? '#4caf50' : (attempt.score ?? 0) >= 50 ? '#ff9800' : '#f44336';

  const responseMap = new Map(responses.map(r => [r.questionId, r]));

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ marginBottom: 4 }}>Quiz Complete</h2>
      <div style={{ color: '#8b9cb0', fontSize: 13, marginBottom: 24 }}>
        {attempt.timedMode !== 'none' && elapsed && `Time: ${fmt(elapsed)} · `}
        {attempt.totalQuestions} questions
      </div>

      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: scoreColor }}>{Math.round(attempt.score ?? 0)}%</div>
        <div style={{ color: '#8b9cb0', fontSize: 14, marginTop: 4 }}>
          {attempt.correctCount} / {attempt.totalQuestions} correct
        </div>
      </div>

      {questions.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <button className="btn btn-secondary" onClick={() => setReviewing(r => !r)} style={{ marginBottom: 12 }}>
            {reviewing ? '▲ Hide Review' : '▼ Review Answers'}
          </button>
          {reviewing && (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {questions.map((q, i) => {
                const resp = responseMap.get(q.id);
                const isCorrect = resp?.isCorrect ?? false;
                return (
                  <div key={q.id} className="card" style={{ marginBottom: 8, padding: 12, borderLeft: `3px solid ${isCorrect ? '#4caf50' : '#f44336'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#8b9cb0' }}>Q{i + 1}</span>
                      <span style={{ fontSize: 11, color: isCorrect ? '#4caf50' : '#f44336' }}>{isCorrect ? '✓ Correct' : '✗ Incorrect'}</span>
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>{q.questionText.slice(0, 120)}{q.questionText.length > 120 ? '…' : ''}</div>
                    {resp && (
                      <div style={{ fontSize: 11, marginBottom: 2 }}>
                        <span style={{ color: '#8b9cb0' }}>Your answer: </span>
                        <span style={{ color: isCorrect ? '#4caf50' : '#f44336' }}>{resp.selectedAnswers.join(', ') || '(none)'}</span>
                      </div>
                    )}
                    {!isCorrect && (
                      <div style={{ fontSize: 11 }}>
                        <span style={{ color: '#8b9cb0' }}>Correct: </span>
                        <span style={{ color: '#4caf50' }}>{q.correctAnswers.join(', ')}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={onRetake}>↺ Retake</button>
        <button className="btn btn-secondary" onClick={onBack}>← Back to Library</button>
      </div>
    </div>
  );
}
