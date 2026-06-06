import React from 'react';
interface Props { onComplete: () => void; onCancel: () => void; }
export function ImportFlow({ onCancel }: Props) {
  return <div style={{ padding: 20 }}><h2>Import</h2><p style={{ color: '#8b9cb0', marginTop: 8 }}>Full implementation coming in Task 10</p><button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={onCancel}>Cancel</button></div>;
}
