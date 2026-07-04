import React from 'react';
import { CHANGELOG } from '../data/changelog';

interface Props {
  onBack: () => void;
}

export function Changelog({ onBack }: Props) {
  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ marginBottom: 16 }}>What&apos;s New</h2>
      {CHANGELOG.map(entry => (
        <div key={entry.version} className="card" style={{ marginBottom: 12, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#64b5f6', marginBottom: 8 }}>
            v{entry.version} <span style={{ color: '#8b9cb0', fontWeight: 400, fontSize: 12 }}>— {entry.date}</span>
          </div>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {entry.changes.map((c, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.8, color: '#c9d4e8' }}>{c}</li>
            ))}
          </ul>
        </div>
      ))}
      <button className="btn btn-secondary" onClick={onBack} style={{ marginTop: 8 }}>← Back</button>
    </div>
  );
}
