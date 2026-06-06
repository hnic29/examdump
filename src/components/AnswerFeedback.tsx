import React from 'react';
import type { Question, QuestionResponse } from '../types';

interface Props {
  question: Question;
  response: QuestionResponse;
  onNext: () => void;
  onOpenLink: (url: string) => void;
}

export function AnswerFeedback({ question, response, onNext, onOpenLink }: Props) {
  const correct = response.isCorrect;

  return (
    <div>
      <div style={{
        padding: '10px 16px', marginBottom: 12, borderRadius: '6px 6px 0 0',
        background: correct ? '#4caf5018' : '#f4433618',
        border: `1px solid ${correct ? '#4caf5040' : '#f4433640'}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 20 }}>{correct ? '✅' : '❌'}</span>
        <span style={{ fontWeight: 700, color: correct ? '#4caf50' : '#f44336', fontSize: 14 }}>
          {correct ? 'Correct!' : 'Incorrect'}
        </span>
      </div>

      <div style={{ marginBottom: 12 }}>
        {question.options.map(opt => {
          const isSelected = response.selectedAnswers.includes(opt.id);
          const isCorrect = question.correctAnswers.includes(opt.id);
          let bg = '#1a1f2e', border = '#2d3a52', color = '#c9d4e8';
          if (isSelected && isCorrect) { bg = '#4caf5020'; border = '#4caf50'; }
          else if (isSelected && !isCorrect) { bg = '#f4433620'; border = '#f44336'; }
          else if (!isSelected && isCorrect) { bg = '#4caf5010'; border = '#4caf5060'; }

          return (
            <div key={opt.id} style={{ display: 'flex', gap: 10, padding: '9px 12px', borderRadius: 6, border: `1px solid ${border}`, background: bg, marginBottom: 6, color }}>
              <div style={{ width: 22, height: 22, borderRadius: 4, background: border, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{opt.id}</div>
              <div style={{ fontSize: 13, paddingTop: 3 }}>
                {opt.text}
                {!isSelected && isCorrect && <span style={{ color: '#4caf50', fontSize: 11, marginLeft: 6 }}>← correct</span>}
              </div>
            </div>
          );
        })}
      </div>

      {question.explanation && (
        <div style={{ borderLeft: `3px solid ${correct ? '#4caf50' : '#f44336'}`, background: '#1e2535', borderRadius: '0 6px 6px 0', padding: '10px 14px', marginBottom: 12, maxHeight: 180, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: '#8b9cb0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Explanation</div>
          <div style={{ fontSize: 12, color: '#c9d4e8', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{question.explanation}</div>
        </div>
      )}

      {question.links && question.links.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#8b9cb0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>References</div>
          {question.links.map((link, i) => (
            <button key={i} className="btn btn-secondary" style={{ marginRight: 6, marginBottom: 4, fontSize: 11 }} onClick={() => onOpenLink(link.url)}>
              🔗 {link.text.slice(0, 50)}
            </button>
          ))}
        </div>
      )}

      <button className="btn btn-success" onClick={onNext}>Next Question →</button>
    </div>
  );
}
