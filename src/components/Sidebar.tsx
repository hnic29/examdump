import React from 'react';
import type { QuestionBank } from '../types';

interface Props {
  banks: QuestionBank[];
  selectedBankId: number | null;
  onSelectBank: (id: number) => void;
  onImport: () => void;
  onHistory: (bankId: number) => void;
  onFlagged: (bankId: number) => void;
  onChangelog: () => void;
  onAiHelper: () => void;
}

export function Sidebar({ banks, selectedBankId, onSelectBank, onImport, onHistory, onFlagged, onChangelog, onAiHelper }: Props) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">ExamDump</div>

      <div className="sidebar-section-label">Question Banks</div>
      <div className="sidebar-banks">
        {banks.length === 0 && (
          <div style={{ padding: '10px 14px', color: '#4a5568', fontSize: 12 }}>
            No banks yet. Import a file to get started.
          </div>
        )}
        {banks.map(bank => (
          <div
            key={bank.id}
            className={`sidebar-bank-item${selectedBankId === bank.id ? ' active' : ''}`}
            onClick={() => onSelectBank(bank.id)}
            title={bank.name}
          >
            📂 {bank.name}
          </div>
        ))}
      </div>

      <div className="sidebar-nav">
        <button className="sidebar-nav-btn" onClick={onImport}>
          📥 Import File
        </button>
        {selectedBankId !== null && (
          <button className="sidebar-nav-btn" onClick={() => onHistory(selectedBankId)}>
            📊 History
          </button>
        )}
        {selectedBankId !== null && (
          <button className="sidebar-nav-btn" onClick={() => onFlagged(selectedBankId)}>
            🚩 Flagged
          </button>
        )}
        <button className="sidebar-nav-btn" onClick={onAiHelper}>
          🤖 AI Helper
        </button>
        <button className="sidebar-nav-btn" onClick={onChangelog}>
          📝 Changelog
        </button>
      </div>
    </div>
  );
}
