export type ID = string

export interface Player {
  id: ID
  name: string
  handle: string
  country: string // emoji flag
  elo: number
  peakElo: number
  wins: number
  losses: number
  /** most-recent-first list of 'W' | 'L' */
  form: ('W' | 'L')[]
  divisionId: ID
  /** rating history points, oldest -> newest */
  history: number[]
  joinedAt: string // ISO
}

export interface Division {
  id: ID
  name: string
  tier: number // 1 = top
  color: string // hex accent
  eloFloor: number
}

export type SetScore = { a: number; b: number }
/** 'final' = real points entered · 'wl' = win/loss only (1–0) · 'rank' = synthesized from a
 *  direct ranking · 'pending' = submitted (e.g. by a scorekeeper) but not yet organizer-validated */
export type MatchStatus = 'final' | 'wl' | 'rank' | 'pending'

export interface Match {
  id: ID
  playerAId: ID
  playerBId: ID
  scoreA: number
  scoreB: number
  sets: SetScore[] | null // per-set points for best-of-N; null for single set / win-loss / rank
  winnerId: ID
  eloDeltaWinner: number
  eloDeltaLoser: number
  divisionId: ID
  format: string // e.g. "1 set to 11"
  status: MatchStatus
  round: number | null // repurposed: 1 = placement decided by a confirmed random draw
  playedAt: string // ISO
}

export type EventStatus = 'draft' | 'qualifying' | 'live' | 'done'

export interface LeagueEvent {
  id: ID
  seriesId: string // groups seasons into one league (separate from name)
  name: string // series name (shared across seasons)
  date: string // ISO
  tables: number // repurposed: number of leagues/divisions
  durationMin: number // repurposed: season number
  season: number
  participantIds: ID[]
  status: EventStatus
}

export interface AppData {
  players: Player[]
  divisions: Division[]
  matches: Match[]
  events: LeagueEvent[]
  seeded: boolean
}

export interface League {
  id: ID
  eventId: ID
  name: string
  tier: number
  color: string
  format: string
  validatedAt: string | null // when the group was validated/locked; null = open
  startScore: number // per-group handicap: matches begin from this score (spec §1); 0 = none
}

export interface LeagueWithPlayers extends League {
  players: Player[]
}

export interface EventDetail {
  event: LeagueEvent
  leagues: LeagueWithPlayers[]
  matches: Match[]
}
