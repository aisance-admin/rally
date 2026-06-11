// FACEIT-style skill levels 1-10 derived from ELO, plus ELO math.

export interface SkillLevel {
  level: number // 1..10
  color: string
  label: string
}

const LEVELS: { min: number; color: string; label: string }[] = [
  { min: 0, color: '#9aa4b2', label: 'Newcomer' }, // 1
  { min: 801, color: '#9aa4b2', label: 'Beginner' }, // 2
  { min: 951, color: '#7fd4a0', label: 'Amateur' }, // 3
  { min: 1101, color: '#5ec26a', label: 'Rising' }, // 4
  { min: 1251, color: '#e7c84b', label: 'Contender' }, // 5
  { min: 1401, color: '#f0a93b', label: 'Skilled' }, // 6
  { min: 1551, color: '#ff8a2a', label: 'Advanced' }, // 7
  { min: 1701, color: '#ff6321', label: 'Expert' }, // 8
  { min: 1851, color: '#ff4a1c', label: 'Elite' }, // 9
  { min: 2001, color: '#ff2d55', label: 'Challenger' }, // 10
]

export function skillFromElo(elo: number): SkillLevel {
  let idx = 0
  for (let i = 0; i < LEVELS.length; i++) {
    if (elo >= LEVELS[i].min) idx = i
  }
  return { level: idx + 1, color: LEVELS[idx].color, label: LEVELS[idx].label }
}

/** Expected score for A vs B (0..1). */
export function expected(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400))
}

export interface EloResult {
  winnerDelta: number
  loserDelta: number
  newWinnerElo: number
  newLoserElo: number
}

/** Standard ELO update for a decisive result, winner -> loser. */
export function applyElo(winnerElo: number, loserElo: number, k = 32): EloResult {
  const eW = expected(winnerElo, loserElo)
  const delta = Math.round(k * (1 - eW))
  return {
    winnerDelta: delta,
    loserDelta: -delta,
    newWinnerElo: winnerElo + delta,
    newLoserElo: loserElo - delta,
  }
}
