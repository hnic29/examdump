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

const ROUNDS = 20;
const LABELS = ['A', 'B', 'C', 'D'];

interface Props {
  questions: Question[];
  onComplete: (score: number) => void;
  onBack: () => void;
}

export function CardPicker({ questions, onComplete, onBack }: Props) {
  const [gameQs] = useState(() => {
    const valid = questions.filter(q => q.questionType !== 'interactive' && q.correctAnswers.length > 0 && q.options.length >= 2);
    return shuffle(valid).slice(0, ROUNDS);
  });
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [opts, setOpts] = useState<Opt[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (idx < gameQs.length) {
      setOpts(buildOptions(questions, gameQs[idx]));
      setPicked(null);
    }
  }, [idx, gameQs.length]);

  if (gameQs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>😕</div>
        <p style={{ color: '#8b9cb0' }}>Not enough scorable questions in this bank.</p>
        <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={onBack}>← Back</button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="game-finish-screen">
        <div className="game-finish-icon">🏆</div>
        <div className="game-finish-title">Card Picker Complete!</div>
        <div className="game-finish-score" style={{ color: '#3b82f6' }}>{score.toLocaleString()}</div>
        <div className="game-finish-label">points · {gameQs.length} questions</div>
        <div className="game-finish-actions">
          <button className="btn btn-secondary" onClick={onBack}>← Games</button>
          <button className="btn btn-primary" onClick={() => onComplete(score)}>Save Score</button>
        </div>
      </div>
    );
  }

  const q = gameQs[idx];
  const answered = picked !== null;
  const wasCorrect = answered && opts[picked]?.isCorrect;

  const handlePick = (i: number) => {
    if (answered) return;
    setPicked(i);
    if (opts[i].isCorrect) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      setScore(s => s + 100 + (newStreak >= 3 ? 50 : 0));
    } else {
      setStreak(0);
    }
  };

  const handleNext = () => {
    if (idx >= gameQs.length - 1) {
      setDone(true);
    } else {
      setIdx(i => i + 1);
    }
  };

  return (
    <div style={{ maxWidth: 660 }}>
      <div className="game-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onBack}>← Back</button>
          <span style={{ color: '#8b9cb0', fontSize: 12 }}>{idx + 1} / {gameQs.length}</span>
          {streak >= 3 && (
            <span style={{ background: '#f59e0b20', color: '#f59e0b', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
              🔥 ×{streak} Streak
            </span>
          )}
        </div>
        <div className="game-score-pill" style={{ color: '#3b82f6' }}>{score.toLocaleString()} pts</div>
      </div>

      <div className="game-progress-bar">
        <div className="game-progress-fill" style={{ width: `${((idx + 1) / gameQs.length) * 100}%`, background: 'linear-gradient(90deg, #1d4ed8, #3b82f6)' }} />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>🃏 Card Picker</div>
        <p style={{ fontSize: 17, lineHeight: 1.65 }}>{q.questionText}</p>
      </div>

      {opts.map((opt, i) => {
        let cls = 'game-opt';
        if (answered) {
          if (opt.isCorrect) cls += ' correct';
          else if (picked === i) cls += ' wrong';
          else cls += ' neutral';
        }
        return (
          <div key={i} className={cls} onClick={() => handlePick(i)}>
            <div className="game-opt-letter" style={{ background: answered && opt.isCorrect ? '#22c55e' : answered && picked === i ? '#ef4444' : '#2d3a52' }}>
              {LABELS[i]}
            </div>
            <span style={{ fontSize: 14, lineHeight: 1.5, flex: 1 }}>{opt.text}</span>
            {answered && opt.isCorrect && <span>✓</span>}
            {answered && picked === i && !opt.isCorrect && <span>✗</span>}
          </div>
        );
      })}

      {answered && (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: wasCorrect ? '#22c55e' : '#ef4444' }}>
            {wasCorrect ? `✓ Correct${streak >= 3 ? ' +50 streak bonus!' : ''}` : '✗ Incorrect'}
          </span>
          <button className="btn btn-primary" onClick={handleNext}>
            {idx >= gameQs.length - 1 ? 'Finish' : 'Next →'}
          </button>
        </div>
      )}
    </div>
  );
}
