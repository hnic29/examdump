import { getDb } from './schema';

export type GameType = 'card-picker' | 'card-hunter-1' | 'card-hunter-2' | 'card-coupler' | 'card-sweeper' | 'elimination' | 'crossword';

export function saveGameScore(bankId: number, gameType: GameType, score: number): void {
  getDb()
    .prepare('INSERT INTO game_scores (bank_id, game_type, score, played_at) VALUES (?, ?, ?, ?)')
    .run(bankId, gameType, score, Math.floor(Date.now() / 1000));
}

export function getBestScores(bankId: number): Partial<Record<GameType, number>> {
  const rows = getDb()
    .prepare('SELECT game_type, MAX(score) as best FROM game_scores WHERE bank_id = ? GROUP BY game_type')
    .all(bankId) as Array<{ game_type: string; best: number }>;
  const result: Partial<Record<GameType, number>> = {};
  for (const row of rows) result[row.game_type as GameType] = row.best;
  return result;
}
