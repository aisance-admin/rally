import type { AppData, Division, LeagueEvent, Match, Player } from '../types'
import { applyElo, skillFromElo } from './elo'

// Deterministic RNG so the mock dataset looks identical every reseed.
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DIVISIONS: Division[] = [
  { id: 'd1', name: 'Elite', tier: 1, color: '#ff2d55', eloFloor: 1850 },
  { id: 'd2', name: 'Division 1', tier: 2, color: '#ff6321', eloFloor: 1550 },
  { id: 'd3', name: 'Division 2', tier: 3, color: '#f0a93b', eloFloor: 1300 },
  { id: 'd4', name: 'Division 3', tier: 4, color: '#5ec26a', eloFloor: 1050 },
  { id: 'd5', name: 'Division 4', tier: 5, color: '#9aa4b2', eloFloor: 0 },
]

function divisionForElo(elo: number): string {
  const d = [...DIVISIONS].sort((a, b) => b.eloFloor - a.eloFloor).find((d) => elo >= d.eloFloor)
  return (d ?? DIVISIONS[DIVISIONS.length - 1]).id
}

interface Seed {
  name: string
  handle: string
  country: string
  elo: number
}

const SEEDS: Seed[] = [
  { name: 'Viktor Sorokin', handle: 'spin_lord', country: '🇷🇺', elo: 2140 },
  { name: 'Mei Tanaka', handle: 'm3i', country: '🇯🇵', elo: 2025 },
  { name: 'Lukas Berg', handle: 'topspin', country: '🇸🇪', elo: 1960 },
  { name: 'Andrei Popa', handle: 'a_popa', country: '🇷🇴', elo: 1885 },
  { name: 'Chen Wei', handle: 'thewall', country: '🇨🇳', elo: 1840 },
  { name: 'Diego Marin', handle: 'forehand', country: '🇪🇸', elo: 1760 },
  { name: 'Olga Kraus', handle: 'okraus', country: '🇩🇪', elo: 1705 },
  { name: 'Sam Whitlock', handle: 'samw', country: '🏴', elo: 1640 },
  { name: 'Petar Ilic', handle: 'p_ilic', country: '🇷🇸', elo: 1585 },
  { name: 'Nadia Haddad', handle: 'nadia_h', country: '🇫🇷', elo: 1520 },
  { name: 'Tomasz Lewandowski', handle: 'tomek', country: '🇵🇱', elo: 1470 },
  { name: 'Ravi Nair', handle: 'rnair', country: '🇮🇳', elo: 1410 },
  { name: 'Elena Costa', handle: 'elena_c', country: '🇮🇹', elo: 1355 },
  { name: 'Marcus Bell', handle: 'mbell', country: '🇺🇸', elo: 1300 },
  { name: 'Yuki Mori', handle: 'yukimori', country: '🇯🇵', elo: 1245 },
  { name: 'Hassan Ali', handle: 'hassan', country: '🇪🇬', elo: 1180 },
  { name: 'Greta Olsen', handle: 'gretao', country: '🇳🇴', elo: 1110 },
  { name: 'Pablo Reyes', handle: 'p_reyes', country: '🇲🇽', elo: 1020 },
  { name: 'Lily Tran', handle: 'lilyt', country: '🇻🇳', elo: 940 },
  { name: 'Jonas Frei', handle: 'newbie_j', country: '🇨🇭', elo: 820 },
]

function isoDaysAgo(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours)
  return d.toISOString()
}

export function buildMockData(): AppData {
  const rng = mulberry32(20240611)
  const players: Player[] = SEEDS.map((s, i) => {
    const total = 18 + Math.floor(rng() * 40)
    const winRate = 0.35 + (s.elo - 800) / 1600 / 1.4 // stronger players win more
    const wins = Math.max(2, Math.round(total * Math.min(0.85, Math.max(0.2, winRate))))
    const losses = Math.max(1, total - wins)
    const form: ('W' | 'L')[] = Array.from({ length: 5 }, () =>
      rng() < Math.min(0.85, Math.max(0.25, winRate)) ? 'W' : 'L',
    )
    // rating history trending to current elo
    const history: number[] = []
    let v = s.elo - 120 + Math.floor(rng() * 60)
    for (let h = 0; h < 12; h++) {
      v += Math.round((s.elo - v) * 0.25 + (rng() - 0.5) * 60)
      history.push(Math.round(v))
    }
    history.push(s.elo)
    return {
      id: `p${i + 1}`,
      name: s.name,
      handle: s.handle,
      country: s.country,
      elo: s.elo,
      peakElo: Math.max(s.elo, ...history),
      wins,
      losses,
      form,
      divisionId: divisionForElo(s.elo),
      history,
      joinedAt: isoDaysAgo(60 + Math.floor(rng() * 200)),
    }
  })

  // Recent matches feed — pair players within the same/adjacent division.
  const matches: Match[] = []
  const byDiv: Record<string, Player[]> = {}
  for (const p of players) (byDiv[p.divisionId] ??= []).push(p)
  const formats = ['1 set to 11', '1 set to 11', 'Best of 3 to 11']
  let mi = 0
  for (let round = 0; round < 6; round++) {
    for (const div of DIVISIONS) {
      const pool = byDiv[div.id]
      if (!pool || pool.length < 2) continue
      const a = pool[Math.floor(rng() * pool.length)]
      let b = pool[Math.floor(rng() * pool.length)]
      let guard = 0
      while (b.id === a.id && guard++ < 5) b = pool[Math.floor(rng() * pool.length)]
      if (b.id === a.id) continue
      const aWins = rng() < (a.elo >= b.elo ? 0.62 : 0.4)
      const winner = aWins ? a : b
      const loser = aWins ? b : a
      const wScore = 11
      const lScore = Math.floor(rng() * 9) + (rng() < 0.3 ? 9 : 4)
      const res = applyElo(winner.elo, loser.elo)
      matches.push({
        id: `m${++mi}`,
        playerAId: a.id,
        playerBId: b.id,
        scoreA: aWins ? wScore : Math.min(lScore, 9),
        scoreB: aWins ? Math.min(lScore, 9) : wScore,
        winnerId: winner.id,
        eloDeltaWinner: res.winnerDelta,
        eloDeltaLoser: res.loserDelta,
        divisionId: div.id,
        format: formats[Math.floor(rng() * formats.length)],
        playedAt: isoDaysAgo(round, Math.floor(rng() * 6)),
      })
    }
  }
  matches.sort((a, b) => +new Date(b.playedAt) - +new Date(a.playedAt))

  const events: LeagueEvent[] = [
    {
      id: 'e1',
      seriesId: 'e1',
      name: 'Thursday Night League',
      date: isoDaysAgo(-1, 0),
      tables: 15,
      durationMin: 120,
      season: 1,
      participantIds: players.slice(0, 16).map((p) => p.id),
      status: 'draft',
    },
    {
      id: 'e2',
      seriesId: 'e2',
      name: 'Last Week · Open Night',
      date: isoDaysAgo(6),
      tables: 12,
      durationMin: 120,
      season: 1,
      participantIds: players.map((p) => p.id),
      status: 'done',
    },
  ]

  return { players, divisions: DIVISIONS, matches, events, seeded: true }
}

export function emptyData(): AppData {
  return { players: [], divisions: DIVISIONS, matches: [], events: [], seeded: false }
}

export { DIVISIONS, divisionForElo }
export { skillFromElo }
