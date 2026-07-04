import React, { useState, useMemo, useRef } from 'react';
import type { Question } from '../../types';

// ── Crossword generator ───────────────────────────────────────────────────────

interface PlacedWord { word: string; clue: string; row: number; col: number; dir: 'across' | 'down'; }

interface CWClue {
  number: number;
  direction: 'across' | 'down';
  clue: string;
  answer: string;
  row: number;
  col: number;
  length: number;
}

interface CrosswordPuzzle { grid: (string | null)[][]; clues: CWClue[]; rows: number; cols: number; }

function cwCanPlace(grid: (string | null)[][], word: string, row: number, col: number, dir: 'across' | 'down', size: number): boolean {
  const dr = dir === 'down' ? 1 : 0;
  const dc = dir === 'across' ? 1 : 0;
  const len = word.length;
  if (row < 0 || col < 0) return false;
  if (dir === 'across' && col + len > size) return false;
  if (dir === 'down' && row + len > size) return false;
  if (grid[row - dr]?.[col - dc] != null) return false;
  if (grid[row + dr * len]?.[col + dc * len] != null) return false;
  const pr = dir === 'across' ? 1 : 0;
  const pc = dir === 'down' ? 1 : 0;
  for (let i = 0; i < len; i++) {
    const r = row + dr * i, c = col + dc * i;
    const existing = grid[r][c];
    if (existing !== null) {
      if (existing !== word[i]) return false;
    } else {
      if (grid[r - pr]?.[c - pc] != null) return false;
      if (grid[r + pr]?.[c + pc] != null) return false;
    }
  }
  return true;
}

function cwPlace(grid: (string | null)[][], word: string, row: number, col: number, dir: 'across' | 'down'): void {
  const dr = dir === 'down' ? 1 : 0;
  const dc = dir === 'across' ? 1 : 0;
  for (let i = 0; i < word.length; i++) grid[row + dr * i][col + dc * i] = word[i];
}

function generateCrossword(pairs: Array<{ clue: string; word: string }>): CrosswordPuzzle | null {
  if (pairs.length < 3) return null;
  const SIZE = 15;
  const grid: (string | null)[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  const placed: PlacedWord[] = [];

  const first = pairs[0];
  const r0 = 7, c0 = Math.floor((SIZE - first.word.length) / 2);
  cwPlace(grid, first.word, r0, c0, 'across');
  placed.push({ word: first.word, clue: first.clue, row: r0, col: c0, dir: 'across' });

  for (let wi = 1; wi < pairs.length && placed.length < 14; wi++) {
    const { word, clue } = pairs[wi];
    let success = false;
    const candidates = [...placed].sort(() => Math.random() - 0.5);
    for (const pw of candidates) {
      if (success) break;
      const perpDir: 'across' | 'down' = pw.dir === 'across' ? 'down' : 'across';
      for (let wi2 = 0; wi2 < word.length && !success; wi2++) {
        for (let pi = 0; pi < pw.word.length && !success; pi++) {
          if (word[wi2] !== pw.word[pi]) continue;
          const tr = pw.dir === 'across' ? pw.row - wi2 : pw.row + pi;
          const tc = pw.dir === 'across' ? pw.col + pi : pw.col - wi2;
          if (cwCanPlace(grid, word, tr, tc, perpDir, SIZE)) {
            cwPlace(grid, word, tr, tc, perpDir);
            placed.push({ word, clue, row: tr, col: tc, dir: perpDir });
            success = true;
          }
        }
      }
    }
  }

  if (placed.length < 3) return null;

  let minR = SIZE, maxR = 0, minC = SIZE, maxC = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (grid[r][c] !== null) {
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      minC = Math.min(minC, c); maxC = Math.max(maxC, c);
    }
  }
  minR = Math.max(0, minR - 1); minC = Math.max(0, minC - 1);
  maxR = Math.min(SIZE - 1, maxR + 1); maxC = Math.min(SIZE - 1, maxC + 1);
  const rows = maxR - minR + 1, cols = maxC - minC + 1;
  const trimmed: (string | null)[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => grid[r + minR][c + minC])
  );
  const adjPlaced = placed.map(p => ({ ...p, row: p.row - minR, col: p.col - minC }));

  const isAcrossStart = (r: number, c: number) =>
    trimmed[r][c] !== null && (c === 0 || trimmed[r][c - 1] === null) && c + 1 < cols && trimmed[r][c + 1] !== null;
  const isDownStart = (r: number, c: number) =>
    trimmed[r][c] !== null && (r === 0 || trimmed[r - 1]?.[c] === null) && r + 1 < rows && trimmed[r + 1]?.[c] !== null;

  const clueNumMap = new Map<string, number>();
  let num = 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (isAcrossStart(r, c) || isDownStart(r, c)) clueNumMap.set(`${r},${c}`, num++);
  }

  const clues: CWClue[] = adjPlaced
    .map(p => {
      const n = clueNumMap.get(`${p.row},${p.col}`);
      if (!n) return null;
      return { number: n, direction: p.dir, clue: p.clue, answer: p.word, row: p.row, col: p.col, length: p.word.length };
    })
    .filter((c): c is CWClue => c !== null)
    .sort((a, b) => a.number - b.number || a.direction.localeCompare(b.direction));

  return { grid: trimmed, clues, rows, cols };
}

function extractWord(q: Question): string | null {
  const correctId = q.correctAnswers[0];
  const opt = q.options.find(o => o.id === correctId);
  if (!opt) return null;
  const clean = opt.text.replace(/[^A-Za-z]/g, '').toUpperCase();
  return clean.length >= 3 && clean.length <= 12 ? clean : null;
}

// ── React component ───────────────────────────────────────────────────────────

interface Selection { row: number; col: number; dir: 'across' | 'down'; }

interface Props {
  questions: Question[];
  onComplete: (score: number) => void;
  onBack: () => void;
}

export function Crossword({ questions, onComplete, onBack }: Props) {
  const [puzzle] = useState<CrosswordPuzzle | null>(() => {
    const valid = questions.filter(q => q.questionType !== 'interactive');
    const pairs = valid
      .map(q => ({ clue: q.questionText, word: extractWord(q) }))
      .filter((p): p is { clue: string; word: string } => p.word !== null);
    if (pairs.length < 3) return null;
    pairs.sort((a, b) => b.word.length - a.word.length);
    return generateCrossword(pairs.slice(0, 20));
  });

  const [userGrid, setUserGrid] = useState<string[][]>(() =>
    puzzle ? Array.from({ length: puzzle.rows }, () => Array(puzzle.cols).fill('')) : []
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [checked, setChecked] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const clueNumbers = useMemo((): Map<string, number> => {
    if (!puzzle) return new Map();
    const map = new Map<string, number>();
    puzzle.clues.forEach(c => map.set(`${c.row},${c.col}`, c.number));
    return map;
  }, [puzzle]);

  const activeClue = useMemo((): CWClue | null => {
    if (!selection || !puzzle) return null;
    return puzzle.clues.find(c =>
      c.direction === selection.dir &&
      (selection.dir === 'across'
        ? c.row === selection.row && selection.col >= c.col && selection.col < c.col + c.length
        : c.col === selection.col && selection.row >= c.row && selection.row < c.row + c.length)
    ) ?? null;
  }, [selection, puzzle]);

  const highlighted = useMemo((): Set<string> => {
    if (!activeClue) return new Set();
    const cells = new Set<string>();
    for (let i = 0; i < activeClue.length; i++) {
      const r = activeClue.dir === 'down' ? activeClue.row + i : activeClue.row;
      const c = activeClue.dir === 'across' ? activeClue.col + i : activeClue.col;
      cells.add(`${r},${c}`);
    }
    return cells;
  }, [activeClue]);

  if (!puzzle) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✏️</div>
        <p style={{ color: '#e0e0e0', marginBottom: 8 }}>Not enough short answers for a crossword.</p>
        <p style={{ color: '#8b9cb0', fontSize: 13, marginBottom: 20 }}>
          Needs at least 3 questions with single-word answers (3–12 letters).
        </p>
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
      </div>
    );
  }

  if (submitted) {
    let correct = 0, total = 0;
    for (let r = 0; r < puzzle.rows; r++) for (let c = 0; c < puzzle.cols; c++) {
      if (puzzle.grid[r][c] !== null) { total++; if (userGrid[r]?.[c] === puzzle.grid[r][c]) correct++; }
    }
    const finalScore = Math.floor((correct / total) * 500);
    return (
      <div className="game-finish-screen">
        <div className="game-finish-icon">✏️</div>
        <div className="game-finish-title">{correct === total ? 'Crossword Solved!' : 'Crossword Checked'}</div>
        <div className="game-finish-score" style={{ color: '#22c55e' }}>{finalScore.toLocaleString()}</div>
        <div className="game-finish-label">{correct}/{total} letters correct</div>
        <div className="game-finish-actions">
          <button className="btn btn-secondary" onClick={onBack}>← Games</button>
          <button className="btn btn-primary" onClick={() => onComplete(finalScore)}>Save Score</button>
        </div>
      </div>
    );
  }

  const handleCellClick = (r: number, c: number) => {
    if (puzzle.grid[r][c] === null) return;
    if (selection?.row === r && selection?.col === c) {
      const otherDir: 'across' | 'down' = selection.dir === 'across' ? 'down' : 'across';
      const hasOther = puzzle.clues.some(cl =>
        cl.direction === otherDir &&
        (otherDir === 'across'
          ? cl.row === r && c >= cl.col && c < cl.col + cl.length
          : cl.col === c && r >= cl.row && r < cl.row + cl.length)
      );
      if (hasOther) setSelection({ row: r, col: c, dir: otherDir });
    } else {
      const hasAcross = puzzle.clues.some(cl => cl.direction === 'across' && cl.row === r && c >= cl.col && c < cl.col + cl.length);
      setSelection({ row: r, col: c, dir: hasAcross ? 'across' : 'down' });
    }
    gridRef.current?.focus();
  };

  const moveCursor = (dr: number, dc: number) => {
    if (!selection) return;
    const nr = selection.row + dr, nc = selection.col + dc;
    if (nr >= 0 && nr < puzzle.rows && nc >= 0 && nc < puzzle.cols && puzzle.grid[nr]?.[nc] !== null) {
      const newDir: 'across' | 'down' = dc !== 0 ? 'across' : 'down';
      setSelection({ row: nr, col: nc, dir: newDir });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!selection) return;
    const { row, col, dir } = selection;
    const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;

    if (e.key === 'Backspace') {
      e.preventDefault();
      setChecked(false);
      const newGrid = userGrid.map(rr => [...rr]);
      if (newGrid[row][col]) {
        newGrid[row][col] = '';
      } else {
        const pr = row - dr, pc = col - dc;
        if (pr >= 0 && pc >= 0 && puzzle.grid[pr]?.[pc] !== null) {
          newGrid[pr][pc] = '';
          setSelection({ row: pr, col: pc, dir });
        }
      }
      setUserGrid(newGrid);
      return;
    }

    if (e.key.length === 1 && /^[A-Za-z]$/.test(e.key)) {
      e.preventDefault();
      setChecked(false);
      const newGrid = userGrid.map(rr => [...rr]);
      newGrid[row][col] = e.key.toUpperCase();
      setUserGrid(newGrid);
      const nr = row + dr, nc = col + dc;
      if (nr < puzzle.rows && nc < puzzle.cols && puzzle.grid[nr]?.[nc] !== null) {
        setSelection({ row: nr, col: nc, dir });
      }
      return;
    }

    const arrowMap: Record<string, [number, number]> = {
      ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0],
    };
    if (e.key in arrowMap) { e.preventDefault(); moveCursor(...arrowMap[e.key]); }
  };

  const handleCheck = () => {
    setChecked(true);
    const allFilled = puzzle.grid.every((row, r) => row.every((cell, c) => cell === null || userGrid[r]?.[c] !== ''));
    const allCorrect = puzzle.grid.every((row, r) => row.every((cell, c) => cell === null || userGrid[r]?.[c] === cell));
    if (allFilled && allCorrect) setSubmitted(true);
  };

  const handleReveal = () => {
    setUserGrid(puzzle.grid.map(r => r.map(cell => cell ?? '')));
    setChecked(true);
    setSubmitted(true);
  };

  const across = puzzle.clues.filter(c => c.direction === 'across');
  const down   = puzzle.clues.filter(c => c.direction === 'down');

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="game-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onBack}>← Back</button>
          <span style={{ color: '#8b9cb0', fontSize: 12 }}>✏️ Crossword · {puzzle.clues.length} clues · click a cell, then type</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={handleCheck}>Check</button>
          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px', color: '#8b9cb0' }} onClick={handleReveal}>Reveal</button>
        </div>
      </div>

      {activeClue && (
        <div style={{ marginBottom: 10, padding: '8px 12px', background: '#1d4ed820', borderRadius: 6, border: '1px solid #3b82f630', fontSize: 13, color: '#93c5fd' }}>
          <strong>{activeClue.number} {activeClue.direction.toUpperCase()}:</strong> {activeClue.clue}
        </div>
      )}

      <div className="cw-grid-wrap" ref={gridRef} tabIndex={0} onKeyDown={handleKeyDown} style={{ outline: 'none' }}>
        {puzzle.grid.map((rowData, r) => (
          <div key={r} className="cw-row">
            {rowData.map((cell, c) => {
              const key = `${r},${c}`;
              const isBlack = cell === null;
              const isSelected = selection?.row === r && selection?.col === c;
              const isHighlighted = highlighted.has(key);
              const userVal = userGrid[r]?.[c] ?? '';
              let isCorrectCell = false, isWrongCell = false;
              if (checked && !isBlack && userVal) {
                isCorrectCell = userVal === cell;
                isWrongCell = !isCorrectCell;
              }
              let cls = 'cw-cell';
              if (isBlack) cls += ' black';
              else if (isSelected) cls += ' selected';
              else if (isHighlighted) cls += ' highlighted';
              if (isCorrectCell) cls += ' correct';
              if (isWrongCell) cls += ' wrong';
              const clueNum = clueNumbers.get(key);
              return (
                <div key={c} className={cls} onClick={() => handleCellClick(r, c)}>
                  {clueNum && !isBlack && <span className="cw-cell-num">{clueNum}</span>}
                  {!isBlack && userVal}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="cw-clues">
        <div>
          <div className="cw-clue-section-title">Across</div>
          {across.map(cl => (
            <div
              key={`${cl.number}A`}
              className={`cw-clue-item${activeClue?.number === cl.number && activeClue?.direction === 'across' ? ' active' : ''}`}
              onClick={() => setSelection({ row: cl.row, col: cl.col, dir: 'across' })}
            >
              <span className="cw-clue-num">{cl.number}</span>
              <span>{cl.clue.length > 70 ? cl.clue.slice(0, 70) + '…' : cl.clue}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="cw-clue-section-title">Down</div>
          {down.map(cl => (
            <div
              key={`${cl.number}D`}
              className={`cw-clue-item${activeClue?.number === cl.number && activeClue?.direction === 'down' ? ' active' : ''}`}
              onClick={() => setSelection({ row: cl.row, col: cl.col, dir: 'down' })}
            >
              <span className="cw-clue-num">{cl.number}</span>
              <span>{cl.clue.length > 70 ? cl.clue.slice(0, 70) + '…' : cl.clue}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
