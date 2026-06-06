import React from 'react';
import type { QuestionBank } from '../types';

interface Props {
  banks: QuestionBank[];
  selectedBankId: number | null;
  onStartQuiz: (bankId: number) => void;
  onDeleteBank: (bankId: number) => void;
  onExportBank: (bankId: number) => void;
}

function formatDate(ts: number | null): string {
  if (!ts) return 'Never';
  return new Date(ts * 1000).toLocaleDateString();
}

export function Library({ banks, selectedBankId, onStartQuiz, onDeleteBank, onExportBank }: Props) {
  const bank = banks.find(b => b.id === selectedBankId) ?? null;

  if (!bank) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 32 }}>📚</div>
        <div style={{ color: '#8b9cb0', fontSize: 14 }}>Select a question bank from the sidebar, or import a new one.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>{bank.name}</h1>
        <div style={{ color: '#8b9cb0', fontSize: 13 }}>Imported from: {bank.sourceFile}</div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ color: '#8b9cb0', fontSize: 11, marginBottom: 4 }}>QUESTIONS</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{bank.questionCount}</div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ color: '#8b9cb0', fontSize: 11, marginBottom: 4 }}>ADDED</div>
          <div style={{ fontSize: 14 }}>{formatDate(bank.createdAt)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn btn-primary"
          onClick={() => onStartQuiz(bank.id)}
          disabled={bank.questionCount === 0}
        >
          ▶ Start Quiz
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => onExportBank(bank.id)}
          disabled={bank.questionCount === 0}
        >
          💾 Export as JSON
        </button>
        <button
          className="btn btn-danger"
          onClick={() => {
            if (window.confirm(`Delete "${bank.name}" and all its history?`)) {
              onDeleteBank(bank.id);
            }
          }}
        >
          🗑 Delete Bank
        </button>
      </div>
    </div>
  );
}
