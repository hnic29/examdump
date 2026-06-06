import React from 'react';
import type { QuestionBank } from '../types';
interface Props { banks: QuestionBank[]; selectedBankId: number | null; onStartQuiz: (id: number) => void; onDeleteBank: (id: number) => void; }
export function Library({ banks, selectedBankId }: Props) {
  const bank = banks.find(b => b.id === selectedBankId);
  if (!bank) return <div style={{ color: '#8b9cb0', padding: 20 }}>Select a question bank from the sidebar.</div>;
  return <div style={{ padding: 20 }}><h2>{bank.name}</h2><p style={{ color: '#8b9cb0', marginTop: 8 }}>{bank.questionCount} questions — full implementation coming in Task 9</p></div>;
}
