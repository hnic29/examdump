import React, { useEffect, useState } from 'react';
import type { QuizAttempt } from '../types';

interface Props {
  bankId: number;
  onBack: () => void;
}

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

function fmtScore(score: number | null): string {
  return score !== null ? `${Math.round(score)}%` : '—';
}

export function History({ bankId, onBack }: Props) {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);

  useEffect(() => {
    window.electronAPI.getHistory(bankId).then(setAttempts);
  }, [bankId]);

  const completed = attempts.filter(a => a.completedAt !== null);

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <h2>Score History</h2>
      </div>

      {completed.length === 0 ? (
        <div style={{ color: '#8b9cb0', fontSize: 13 }}>No completed attempts yet.</div>
      ) : (
        <>
          {/* Score trend bar chart */}
          <div className="card" style={{ marginBottom: 20, padding: 16 }}>
            <div style={{ fontSize: 11, color: '#8b9cb0', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Score Trend</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
              {completed.slice(-10).map((a, i) => {
                const pct = a.score ?? 0;
                const color = pct >= 70 ? '#4caf50' : pct >= 50 ? '#ff9800' : '#f44336';
                return (
                  <div key={a.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ background: color, borderRadius: 3, width: '100%', height: `${pct * 0.6}%`, minHeight: 4 }} title={`${Math.round(pct)}%`} />
                    <div style={{ fontSize: 9, color: '#4a5568' }}>{i + 1}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            {completed.map(a => (
              <div key={a.id} className="card" style={{ marginBottom: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#8b9cb0', marginBottom: 2 }}>{fmtDate(a.startedAt)}</div>
                  <div style={{ fontSize: 11, color: '#4a5568' }}>
                    {a.timedMode !== 'none' ? `⏱ ${a.timedMode}` : 'Untimed'} · {a.totalQuestions} questions
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: (a.score ?? 0) >= 70 ? '#4caf50' : (a.score ?? 0) >= 50 ? '#ff9800' : '#f44336' }}>
                    {fmtScore(a.score)}
                  </div>
                  <div style={{ fontSize: 11, color: '#8b9cb0' }}>{a.correctCount}/{a.totalQuestions}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
