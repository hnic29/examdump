import React, { useState, useEffect, useCallback } from 'react';
import type { FlaggedQuestion } from '../types';

interface Props {
  bankId: number;
  onBack: () => void;
}

export function FlaggedLog({ bankId, onBack }: Props) {
  const [flagged, setFlagged] = useState<FlaggedQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = await window.electronAPI.getFlaggedQuestions(bankId);
    setFlagged(qs);
    setLoading(false);
  }, [bankId]);

  useEffect(() => { load(); }, [load]);

  const unflag = async (questionId: number) => {
    await window.electronAPI.unflagQuestion(questionId);
    setFlagged(prev => prev.filter(f => f.questionId !== questionId));
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <h2 style={{ margin: 0 }}>Flagged for Review</h2>
        {!loading && (
          <span style={{ color: '#8b9cb0', fontSize: 13 }}>{flagged.length} question{flagged.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {loading && <p style={{ color: '#8b9cb0' }}>Loading…</p>}

      {!loading && flagged.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#4a5568' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚑</div>
          <p style={{ fontSize: 14 }}>No flagged questions yet.</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>
            During a quiz, click the flag icon next to the question number to mark it for review.
          </p>
        </div>
      )}

      {!loading && flagged.length > 0 && (
        <div style={{ border: '1px solid #2d3748', borderRadius: 6, overflow: 'hidden' }}>
          {flagged.map((f, i) => (
            <div
              key={f.questionId}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 16px',
                borderBottom: i < flagged.length - 1 ? '1px solid #1e2a3a' : 'none',
                background: '#0d1117',
              }}
            >
              <span style={{ color: '#f59e0b', fontSize: 16, flexShrink: 0, marginTop: 2 }}>🚩</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ color: '#5a7a9a', fontSize: 11, fontWeight: 700 }}>Q{f.orderIndex + 1}</span>
                  <span style={{ color: '#4a5568', fontSize: 11 }}>
                    Flagged {formatDate(f.flaggedAt)}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#c9d4e8', lineHeight: 1.5 }}>
                  {f.questionText.length > 200 ? f.questionText.slice(0, 200) + '…' : f.questionText}
                </p>
              </div>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0, marginTop: 2 }}
                onClick={() => unflag(f.questionId)}
                title="Remove flag"
              >
                Unflag
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
