import React, { useState, useEffect, useRef } from 'react';
import type { Question } from '../../types';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface HunterCard { text: string; isCorrect: boolean; }

function buildGrid(allQs: Question[], current: Question, count: number): HunterCard[] {
  const correctId = current.correctAnswers[0];
  const correctOpt = current.options.find(o => o.id === correctId);
  if (!correctOpt) return [];
  const wrongPool = shuffle([
    ...current.options.filter(o => !current.correctAnswers.includes(o.id)),
    ...allQs.filter(q => q.id !== current.id).flatMap(q =>
      q.options.filter(o => !q.correctAnswers.includes(o.id))
    ),
  ]).slice(0, count - 1);
  return shuffle([{ text: correctOpt.text, isCorrect: true }, ...wrongPool.map(o => ({ text: o.text, isCorrect: false }))]);
}

const ROUNDS = 15;
const CONFIG = {
  1: { time: 30, gridCount: 8, label: 'Card Hunter', accentColor: '#f59e0b', gradient: 'linear-gradient(90deg, #b45309, #f59e0b)' },
  2: { time: 15, gridCount: 10, label: 'Card Hunter II', accentColor: '#ef4444', gradient: 'linear-gradient(90deg, #991b1b, #ef4444)' },
} as const;

interface Props {
  questions: Question[];
  level: 1 | 2;
  onComplete: (score: number) => void;
  onBack: () => void;
}

export function CardHunter({ questions, level, onComplete, onBack }: Props) {
  const cfg = CONFIG[level];
  const [gameQs] = useState(() => {
    const valid = questions.filter(q => q.questionType !== 'interactive' && q.correctAnswers.length > 0 && q.options.length >= 2);
    return shuffle(valid).slice(0, ROUNDS);
  });
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(cfg.time);
  const [grid, setGrid] = useState<HunterCard[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [phase, setPhase] = useState<'playing' | 'feedback' | 'done'>('playing');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const advance = () => {
    if (idx >= gameQs.length - 1) {
      setPhase('done');
    } else {
      const next = idx + 1;
      setIdx(next);
      setGrid(buildGrid(questions, gameQs[next], cfg.gridCount));
      setPicked(null);
      setTimeLeft(cfg.time);
      setPhase('playing');
    }
  };

  useEffect(() => {
    if (gameQs.length === 0) return;
    setGrid(buildGrid(questions, gameQs[0], cfg.gridCount));
  }, []);

  useEffect(() => {
    if (phase !== 'playing' || gameQs.length === 0) return;
    stopTimer();
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          stopTimer();
          setPicked(-1);
          setPhase('feedback');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return stopTimer;
  }, [phase, idx]);

  useEffect(() => {
    if (phase === 'feedback') {
      const id = setTimeout(advance, 1400);
      return () => clearTimeout(id);
    }
  }, [phase, idx]);

  if (gameQs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>😕</div>
        <p style={{ color: '#8b9cb0' }}>Need more questions for this game.</p>
        <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={onBack}>← Back</button>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="game-finish-screen">
        <div className="game-finish-icon">🏆</div>
        <div className="game-finish-title">{cfg.label} Complete!</div>
        <div className="game-finish-score" style={{ color: cfg.accentColor }}>{score.toLocaleString()}</div>
        <div className="game-finish-label">points · {gameQs.length} rounds</div>
        <div className="game-finish-actions">
          <button className="btn btn-secondary" onClick={onBack}>← Games</button>
          <button className="btn btn-primary" onClick={() => onComplete(score)}>Save Score</button>
        </div>
      </div>
    );
  }

  const q = gameQs[idx];
  const timerPct = (timeLeft / cfg.time) * 100;
  const timerColor = timerPct > 50 ? cfg.accentColor : timerPct > 25 ? '#f59e0b' : '#ef4444';

  const handlePick = (i: number) => {
    if (phase !== 'playing') return;
    stopTimer();
    setPicked(i);
    setPhase('feedback');
    if (grid[i].isCorrect) {
      const bonus = Math.floor(timeLeft / cfg.time * 30);
      setScore(s => s + 50 + bonus);
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="game-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onBack}>← Back</button>
          <span style={{ color: '#8b9cb0', fontSize: 12 }}>{idx + 1} / {gameQs.length}</span>
        </div>
        <div className="game-score-pill" style={{ color: cfg.accentColor }}>{score.toLocaleString()} pts</div>
      </div>

      <div className="timer-bar-wrap">
        <div className="timer-bar-fill" style={{ width: `${timerPct}%`, background: timerColor }} />
      </div>

      <div className="card" style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 10, color: cfg.accentColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
          {level === 1 ? '🔍' : '⚡'} {cfg.label} · {timeLeft}s
        </div>
        <p style={{ fontSize: 17, lineHeight: 1.65 }}>{q.questionText}</p>
      </div>

      <div className="hunter-grid" style={{ gridTemplateColumns: level === 2 ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)' }}>
        {grid.map((card, i) => {
          let cls = 'hunter-card';
          if (phase === 'feedback') {
            if (card.isCorrect) cls += ' correct';
            else if (picked === i) cls += ' wrong';
          }
          return (
            <div key={i} className={cls} onClick={() => handlePick(i)}>
              {card.text}
            </div>
          );
        })}
      </div>

      {phase === 'feedback' && (
        <div style={{ marginTop: 12, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
          {picked === -1
            ? <span style={{ color: '#ef4444' }}>⏰ Time's up!</span>
            : grid[picked]?.isCorrect
              ? <span style={{ color: '#22c55e' }}>✓ Found it!</span>
              : <span style={{ color: '#ef4444' }}>✗ Wrong card</span>}
        </div>
      )}
    </div>
  );
}
