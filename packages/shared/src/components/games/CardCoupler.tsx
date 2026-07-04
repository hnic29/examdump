import React, { useState } from 'react';
import type { Question } from '../../types';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Pair { id: number; question: string; answer: string; }
interface WrongFlash { leftId: number; rightId: number; }

const PAIRS_COUNT = 6;

interface Props {
  questions: Question[];
  onComplete: (score: number) => void;
  onBack: () => void;
}

export function CardCoupler({ questions, onComplete, onBack }: Props) {
  const [pairs] = useState<Pair[]>(() => {
    const valid = questions.filter(q =>
      q.questionType !== 'interactive' &&
      q.correctAnswers.length > 0 &&
      q.options.length >= 1
    );
    return shuffle(valid).slice(0, PAIRS_COUNT).map((q, i) => {
      const answerId = q.correctAnswers[0];
      const answerOpt = q.options.find(o => o.id === answerId);
      return { id: i, question: q.questionText, answer: answerOpt?.text ?? answerId };
    });
  });

  const [rightOrder] = useState<number[]>(() => shuffle(pairs.map(p => p.id)));
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [selectedRight, setSelectedRight] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrongFlash, setWrongFlash] = useState<WrongFlash | null>(null);
  const [wrongCount, setWrongCount] = useState(0);
  const [done, setDone] = useState(false);
  const [score, setScore] = useState(0);

  if (pairs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>😕</div>
        <p style={{ color: '#8b9cb0' }}>Not enough questions for Card Coupler.</p>
        <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={onBack}>← Back</button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="game-finish-screen">
        <div className="game-finish-icon">🔗</div>
        <div className="game-finish-title">All Pairs Matched!</div>
        <div className="game-finish-score" style={{ color: '#8b5cf6' }}>{score.toLocaleString()}</div>
        <div className="game-finish-label">points · {wrongCount} wrong attempt{wrongCount !== 1 ? 's' : ''}</div>
        <div className="game-finish-actions">
          <button className="btn btn-secondary" onClick={onBack}>← Games</button>
          <button className="btn btn-primary" onClick={() => onComplete(score)}>Save Score</button>
        </div>
      </div>
    );
  }

  const tryMatch = (leftId: number, rightId: number) => {
    if (leftId === rightId) {
      const newMatched = new Set(matched).add(leftId);
      setMatched(newMatched);
      const finalScore = Math.max(0, pairs.length * 100 - wrongCount * 20);
      if (newMatched.size >= pairs.length) {
        setScore(finalScore);
        setDone(true);
      }
      setSelectedLeft(null);
      setSelectedRight(null);
    } else {
      setWrongCount(c => c + 1);
      setWrongFlash({ leftId, rightId });
      setTimeout(() => {
        setWrongFlash(null);
        setSelectedLeft(null);
        setSelectedRight(null);
      }, 600);
    }
  };

  const handleLeftClick = (id: number) => {
    if (matched.has(id) || wrongFlash) return;
    const newLeft = selectedLeft === id ? null : id;
    setSelectedLeft(newLeft);
    if (newLeft !== null && selectedRight !== null) {
      tryMatch(newLeft, selectedRight);
    }
  };

  const handleRightClick = (id: number) => {
    if (matched.has(id) || wrongFlash) return;
    const newRight = selectedRight === id ? null : id;
    setSelectedRight(newRight);
    if (selectedLeft !== null && newRight !== null) {
      tryMatch(selectedLeft, newRight);
    }
  };

  const remaining = pairs.length - matched.size;

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="game-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onBack}>← Back</button>
          <span style={{ color: '#8b9cb0', fontSize: 12 }}>{remaining} pair{remaining !== 1 ? 's' : ''} remaining</span>
        </div>
        <div className="game-score-pill" style={{ color: '#8b5cf6' }}>
          {wrongCount > 0 ? `-${wrongCount * 20} penalty` : 'Perfect so far'}
        </div>
      </div>

      <div style={{ marginBottom: 12, fontSize: 12, color: '#8b9cb0' }}>
        🔗 <strong>Card Coupler</strong> — Click a term on the left, then its matching definition on the right.
      </div>

      <div className="coupler-grid">
        {/* Left column: questions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10, color: '#8b9cb0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Terms</div>
          {pairs.map(pair => {
            const isMatched = matched.has(pair.id);
            const isSelected = selectedLeft === pair.id;
            const isWrong = wrongFlash?.leftId === pair.id;
            let cls = 'coupler-item';
            if (isMatched) cls += ' matched';
            else if (isWrong) cls += ' wrong';
            else if (isSelected) cls += ' selected';
            return (
              <div key={pair.id} className={cls} onClick={() => handleLeftClick(pair.id)}>
                <span style={{ fontSize: 12, lineHeight: 1.4 }}>{pair.question.length > 80 ? pair.question.slice(0, 80) + '…' : pair.question}</span>
              </div>
            );
          })}
        </div>

        {/* Right column: answers (shuffled) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10, color: '#8b9cb0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Definitions</div>
          {rightOrder.map(id => {
            const pair = pairs.find(p => p.id === id)!;
            const isMatched = matched.has(id);
            const isSelected = selectedRight === id;
            const isWrong = wrongFlash?.rightId === id;
            let cls = 'coupler-item';
            if (isMatched) cls += ' matched';
            else if (isWrong) cls += ' wrong';
            else if (isSelected) cls += ' selected';
            return (
              <div key={id} className={cls} onClick={() => handleRightClick(id)}>
                <span style={{ fontSize: 12, lineHeight: 1.4 }}>{pair.answer.length > 80 ? pair.answer.slice(0, 80) + '…' : pair.answer}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
