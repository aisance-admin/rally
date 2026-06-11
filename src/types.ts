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

export interface Match {
  id: ID
  playerAId: ID
  playerBId: ID
  scoreA: number
  scoreB: number
  winnerId: ID
  eloDeltaWinner: number
  eloDeltaLoser: number
  divisionId: ID
  format: string // e.g. "1 set to 11"
  playedAt: string // ISO
}

export type EventStatus = 'draft' | 'qualifying' | 'live' | 'done'

export interface LeagueEvent {
  id: ID
  name: string
  date: string // ISO
  tables: number
  durationMin: number
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
}

export interface LeagueWithPlayers extends League {
  players: Player[]
}

export interface EventDetail {
  event: LeagueEvent
  leagues: LeagueWithPlayers[]
  matches: Match[]
}
