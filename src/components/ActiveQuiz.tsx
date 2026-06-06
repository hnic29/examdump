import React from 'react';
interface Props { bankId: number; onComplete: (attemptId: number) => void; onCancel: () => void; }
export function ActiveQuiz({ onCancel }: Props) {
  return <div style={{ padding: 20 }}><h2>Quiz</h2><p style={{ color: '#8b9cb0', marginTop: 8 }}>Full implementation coming in Task 12</p><button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={onCancel}>Cancel</button></div>;
}
