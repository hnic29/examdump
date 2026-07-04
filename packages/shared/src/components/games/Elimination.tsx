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

const MAX_LIVES = 3;
const TIME_PER_Q = 10;
const LABELS = ['A', 'B', 'C', 'D'];

interface Props {
  questions: Question[];
  onComplete: (score: number) => void;
  onBack: () => void;
}

export function Elimination({ questions, onComplete, onBack }: Props) {
  const [gameQs] = useState(() => {
    const valid = questions.filter(q => q.questionType !== 'interactive' && q.correctAnswers.length > 0 && q.options.length >= 2);
    return shuffle(valid);
  });
  const [idx, setIdx] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_Q);
  const [opts, setOpts] = useState<Opt[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [phase, setPhase] = useState<'playing' | 'feedback' | 'dead'>('playing');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const advanceQuestion = (currentLives: number) => {
    if (currentLives <= 0) {
      setPhase('dead');
      return;
    }
    const next = idx + 1;
    if (next >= gameQs.length) {
      setPhase('dead');
      return;
    }
    setIdx(next);
    setOpts(buildOptions(questions, gameQs[next]));
    setPicked(null);
    setTimeLeft(TIME_PER_Q);
    setPhase('playing');
  };

  useEffect(() => {
    if (gameQs.length > 0) {
      setOpts(buildOptions(questions, gameQs[0]));
    }
  }, []);

  useEffect(() => {
    if (phase !== 'playing' || gameQs.length === 0) return;
    stopTimer();
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          stopTimer();
          const newLives = lives - 1;
          setLives(newLives);
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
      const id = setTimeout(() => advanceQuestion(lives), 1200);
      return () => clearTimeout(id);
    }
  }, [phase, lives, idx]);

  if (phase === 'dead' || (phase === 'feedback' && lives <= 0)) {
    return (
      <div className="game-finish-screen">
        <div className="game-finish-icon">{score === 0 ? '💀' : lives <= 0 ? '💀' : '🏆'}</div>
        <div className="game-finish-title">{lives <= 0 ? 'Eliminated!' : 'Complete!'}</div>
        <div className="game-finish-score" style={{ color: '#ec4899' }}>{score.toLocaleString()}</div>
        <div className="game-finish-label">points · survived {idx} question{idx !== 1 ? 's' : ''}</div>
        <div className="game-finish-actions">
          <button className="btn btn-secondary" onClick={onBack}>← Games</button>
          <button className="btn btn-primary" onClick={() => onComplete(score)}>Save Score</button>
        </div>
      </div>
    );
  }

  if (gameQs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>😕</div>
        <p style={{ color: '#8b9cb0' }}>Not enough questions for Elimination.</p>
        <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={onBack}>← Back</button>
      </div>
    );
  }

  const q = gameQs[idx];
  const answered = picked !== null;
  const wasCorrect = answered && picked >= 0 && opts[picked]?.isCorrect;
  const timerPct = (timeLeft / TIME_PER_Q) * 100;
  const timerColor = timerPct > 50 ? '#22c55e' : timerPct > 25 ? '#f59e0b' : '#ef4444';

  const handlePick = (i: number) => {
    if (answered || phase !== 'playing') return;
    stopTimer();
    setPicked(i);
    if (opts[i].isCorrect) {
      setScore(s => s + 10);
      setPhase('feedback');
    } else {
      const newLives = lives - 1;
      setLives(newLives);
      setPhase('feedback');
    }
  };

  return (
    <div style={{ maxWidth: 660 }}>
      <div className="game-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onBack}>← Back</button>
          <div className="elim-lives">
            {Array.from({ length: MAX_LIVES }, (_, i) => (
              <span key={i} style={{ opacity: i < lives ? 1 : 0.2 }}>❤️</span>
            ))}
          </div>
          <span style={{ color: '#8b9cb0', fontSize: 12 }}>Q{idx + 1}</span>
        </div>
        <div className="game-score-pill" style={{ color: '#ec4899' }}>{score.toLocaleString()} pts</div>
      </div>

      <div className="timer-bar-wrap">
        <div className="timer-bar-fill" style={{ width: `${timerPct}%`, background: timerColor }} />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: '#ec4899', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
          ❤️ Elimination · {timeLeft}s
        </div>
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
        <div style={{ marginTop: 12, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
          {picked === -1
            ? <span style={{ color: '#ef4444' }}>⏰ Time's up — lost a life!</span>
            : wasCorrect
              ? <span style={{ color: '#22c55e' }}>✓ Correct +10</span>
              : <span style={{ color: '#ef4444' }}>✗ Wrong — {lives} {lives === 1 ? 'life' : 'lives'} left</span>}
        </div>
      )}
    </div>
  );
}
