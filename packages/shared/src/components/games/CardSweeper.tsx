import React, { useState, useEffect } from 'react';
import type { Question } from '../../types';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Opt { text: string; isCorrect: boolean; }

function buildOptions(allQs: Question[], current: Question): Opt[] {
  const correctId = current.correctAnswers[0];
  const correctOpt = current.options.find(o => o.id === correctId);
  if (!correctOpt) return [];
  const wrongPool = shuffle([
    ...current.options.filter(o => !current.correctAnswers.includes(o.id)),
    ...allQs.filter(q => q.id !== current.id).flatMap(q =>
      q.options.filter(o => !q.correctAnswers.includes(o.id))
    ),
  ]).slice(0, 3);
  return shuffle([{ text: correctOpt.text, isCorrect: true }, ...wrongPool.map(o => ({ text: o.text, isCorrect: false }))]);
}

const LABELS = ['A', 'B', 'C', 'D'];

interface Props {
  questions: Question[];
  onComplete: (score: number) => void;
  onBack: () => void;
}

export function CardSweeper({ questions, onComplete, onBack }: Props) {
  const [startCount] = useState(() => {
    const valid = questions.filter(q => q.questionType !== 'interactive' && q.correctAnswers.length > 0 && q.options.length >= 2);
    return Math.min(valid.length, 20);
  });
  const [deck, setDeck] = useState<Question[]>(() => {
    const valid = questions.filter(q => q.questionType !== 'interactive' && q.correctAnswers.length > 0 && q.options.length >= 2);
    return shuffle(valid).slice(0, 20);
  });
  const [swept, setSwept] = useState(0);
  const [recycled, setRecycled] = useState(0);
  const [score, setScore] = useState(1000);
  const [opts, setOpts] = useState<Opt[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (deck.length > 0) {
      setOpts(buildOptions(questions, deck[0]));
      setPicked(null);
    }
  }, [deck[0]?.id]);

  if (startCount === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>😕</div>
        <p style={{ color: '#8b9cb0' }}>Not enough questions for Card Sweeper.</p>
        <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={onBack}>← Back</button>
      </div>
    );
  }

  if (deck.length === 0) {
    return (
      <div className="game-finish-screen">
        <div className="game-finish-icon">🧹</div>
        <div className="game-finish-title">Deck Cleared!</div>
        <div className="game-finish-score" style={{ color: '#14b8a6' }}>{score.toLocaleString()}</div>
        <div className="game-finish-label">points · {recycled} recycled</div>
        <div className="game-finish-actions">
          <button className="btn btn-secondary" onClick={onBack}>← Games</button>
          <button className="btn btn-primary" onClick={() => onComplete(score)}>Save Score</button>
        </div>
      </div>
    );
  }

  const current = deck[0];
  const answered = picked !== null;
  const wasCorrect = answered && opts[picked]?.isCorrect;

  const handlePick = (i: number) => {
    if (answered || animating) return;
    setPicked(i);
  };

  const handleConfirm = () => {
    if (picked === null || animating) return;
    const correct = opts[picked].isCorrect;
    setAnimating(true);

    setTimeout(() => {
      if (correct) {
        setSwept(s => s + 1);
        setDeck(d => d.slice(1));
      } else {
        setScore(s => Math.max(0, s - 50));
        setRecycled(r => r + 1);
        setDeck(d => {
          const [top, ...rest] = d;
          return [...rest, top];
        });
      }
      setAnimating(false);
    }, 350);
  };

  const remaining = deck.length;

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="game-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onBack}>← Back</button>
          <span style={{ color: '#8b9cb0', fontSize: 12 }}>{remaining} card{remaining !== 1 ? 's' : ''} left</span>
        </div>
        <div className="game-score-pill" style={{ color: '#14b8a6' }}>{score.toLocaleString()} pts</div>
      </div>

      <div style={{ marginBottom: 10, display: 'flex', gap: 14, fontSize: 12, color: '#8b9cb0', alignItems: 'center' }}>
        <span>💨 {swept} swept</span>
        <span>🔄 {recycled} recycled</span>
        <div style={{ flex: 1 }}>
          <div style={{ height: 3, background: '#1e2535', borderRadius: 2 }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg, #0f766e, #14b8a6)', borderRadius: 2, width: `${(swept / startCount) * 100}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      <div className="sweeper-stack">
        {remaining > 1 && <div className="sweeper-ghost" />}
        <div className="sweeper-card" style={{ opacity: animating ? 0.4 : 1, transition: 'opacity 0.35s' }}>
          <div>
            <div style={{ fontSize: 10, color: '#14b8a6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>🧹 Card Sweeper</div>
            <p style={{ fontSize: 16, lineHeight: 1.65 }}>{current.questionText}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        {opts.map((opt, i) => {
          let cls = 'game-opt';
          if (answered) {
            if (opt.isCorrect) cls += ' correct';
            else if (picked === i) cls += ' wrong';
            else cls += ' neutral';
          }
          return (
            <div key={i} className={cls} onClick={() => handlePick(i)}>
              <div className="game-opt-letter" style={{ background: answered && opt.isCorrect ? '#22c55e' : answered && picked === i && !opt.isCorrect ? '#ef4444' : '#2d3a52' }}>
                {LABELS[i]}
              </div>
              <span style={{ fontSize: 14, lineHeight: 1.5, flex: 1 }}>{opt.text}</span>
            </div>
          );
        })}
      </div>

      {answered && (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: wasCorrect ? '#22c55e' : '#ef4444' }}>
            {wasCorrect ? '✓ Correct — swept!' : '✗ Incorrect — recycled to bottom'}
          </span>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={animating}>
            {wasCorrect ? '💨 Sweep' : '🔄 Next'}
          </button>
        </div>
      )}
    </div>
  );
}
