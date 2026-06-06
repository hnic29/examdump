import React from 'react';
interface Props { bankId: number; onBack: () => void; }
export function History({ onBack }: Props) {
  return <div style={{ padding: 20 }}><h2>History</h2><p style={{ color: '#8b9cb0', marginTop: 8 }}>Full implementation coming in Task 13</p><button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={onBack}>Back</button></div>;
}
