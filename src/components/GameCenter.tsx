import React, { useState, useEffect } from 'react';
import type { Question, GameType } from '../types';
import { CardPicker } from './games/CardPicker';
import { CardHunter } from './games/CardHunter';
import { CardCoupler } from './games/CardCoupler';
import { CardSweeper } from './games/CardSweeper';
import { Elimination } from './games/Elimination';
import { Crossword } from './games/Crossword';

interface GameMeta {
  type: GameType;
  title: string;
  description: string;
  icon: string;
  gradient: string;
  accentColor: string;
  minQuestions: number;
}

const GAMES: GameMeta[] = [
  {
    type: 'card-picker',
    title: 'Card Picker',
    description: 'Spot the correct answer from 4 choices. Build streaks, earn bonus points.',
    icon: '🃏',
    gradient: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
    accentColor: '#3b82f6',
    minQuestions: 4,
  },
  {
    type: 'card-hunter-1',
    title: 'Card Hunter',
    description: 'Hunt the matching card in a grid before the clock runs out. 30 seconds per round.',
    icon: '🔍',
    gradient: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
    accentColor: '#f59e0b',
    minQuestions: 8,
  },
  {
    type: 'card-hunter-2',
    title: 'Card Hunter II',
    description: 'Faster, more distractors, half the time. Only 15 seconds per round.',
    icon: '⚡',
    gradient: 'linear-gradient(135deg, #991b1b 0%, #ef4444 100%)',
    accentColor: '#ef4444',
    minQuestions: 10,
  },
  {
    type: 'card-coupler',
    title: 'Card Coupler',
    description: 'Match every term to its definition. Speed and accuracy both count.',
    icon: '🔗',
    gradient: 'linear-gradient(135deg, #5b21b6 0%, #8b5cf6 100%)',
    accentColor: '#8b5cf6',
    minQuestions: 6,
  },
  {
    type: 'card-sweeper',
    title: 'Card Sweeper',
    description: 'Clear the deck by answering correctly. Wrong answers recycle to the bottom.',
    icon: '🧹',
    gradient: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
    accentColor: '#14b8a6',
    minQuestions: 5,
  },
  {
    type: 'elimination',
    title: 'Elimination',
    description: 'Three lives. Ten seconds. One wrong move costs you. Survive as long as you can.',
    icon: '❤️',
    gradient: 'linear-gradient(135deg, #9d174d 0%, #ec4899 100%)',
    accentColor: '#ec4899',
    minQuestions: 5,
  },
  {
    type: 'crossword',
    title: 'Crossword',
    description: 'Key terms fill the grid — question text is the clue. Think before you type.',
    icon: '✏️',
    gradient: 'linear-gradient(135deg, #15803d 0%, #22c55e 100%)',
    accentColor: '#22c55e',
    minQuestions: 5,
  },
];

interface GameProps {
  questions: Question[];
  onComplete: (score: number) => void;
  onBack: () => void;
}

interface Props {
  bankId: number;
  onBack: () => void;
}

export function GameCenter({ bankId, onBack }: Props) {
  const [bestScores, setBestScores] = useState<Partial<Record<GameType, number>>>({});
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeGame, setActiveGame] = useState<GameType | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [scores, qs] = await Promise.all([
        window.electronAPI.getGameScores(bankId),
        window.electronAPI.loadQuestions(bankId),
      ]);
      if (cancelled) return;
      setBestScores(scores);
      setQuestions(qs);
    })();
    return () => { cancelled = true; };
  }, [bankId]);

  const handleGameComplete = async (score: number) => {
    if (!activeGame) return;
    await window.electronAPI.saveGameScore(bankId, activeGame, score);
    setBestScores(prev => {
      const prevBest = prev[activeGame] ?? -1;
      return score > prevBest ? { ...prev, [activeGame]: score } : prev;
    });
    setActiveGame(null);
  };

  const handleGameBack = () => setActiveGame(null);

  if (activeGame) {
    const gameProps: GameProps = { questions, onComplete: handleGameComplete, onBack: handleGameBack };
    switch (activeGame) {
      case 'card-picker':   return <CardPicker {...gameProps} />;
      case 'card-hunter-1': return <CardHunter {...gameProps} level={1} />;
      case 'card-hunter-2': return <CardHunter {...gameProps} level={2} />;
      case 'card-coupler':  return <CardCoupler {...gameProps} />;
      case 'card-sweeper':  return <CardSweeper {...gameProps} />;
      case 'elimination':   return <Elimination {...gameProps} />;
      case 'crossword':     return <Crossword {...gameProps} />;
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e0e0e0', lineHeight: 1.2 }}>🎮 Game Center</h1>
          <p style={{ color: '#8b9cb0', fontSize: 12, marginTop: 2 }}>Active recall through play — same material, less monotony.</p>
        </div>
      </div>

      <div className="gc-grid">
        {GAMES.map(game => {
          const best = bestScores[game.type];
          const playable = questions.length >= game.minQuestions;
          return (
            <div key={game.type} className="gc-game-card">
              <div className="gc-game-card-icon" style={{ background: game.gradient }}>
                {game.icon}
              </div>
              <div className="gc-game-card-body">
                <div className="gc-game-title">{game.title}</div>
                <div className="gc-game-desc">{game.description}</div>
                <div className="gc-game-best">
                  Best score:{' '}
                  <span style={{ color: best !== undefined ? game.accentColor : '#4a5568' }}>
                    {best !== undefined ? best.toLocaleString() : '—'}
                  </span>
                </div>
                {!playable && (
                  <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 6 }}>
                    Needs {game.minQuestions}+ questions
                  </div>
                )}
                <button
                  className="gc-start-btn"
                  style={{ background: playable ? game.gradient : '#1e2535' }}
                  disabled={!playable}
                  onClick={() => setActiveGame(game.type)}
                >
                  ▶ Start playing
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
