import { supabase } from './supabase'
import { manualSizes } from './planner'
import type { EventDetail, LeagueEvent, LeagueWithPlayers, Match, Player } from '../types'

export const LEAGUE_NAMES = ['Division 1', 'Division 2', 'Division 3', 'Division 4', 'Division 5', 'Division 6', 'Division 7', 'Division 8']
export const LEAGUE_COLORS = ['#ff5a3c', '#ff8a3d', '#ffc24b', '#5ed6a0', '#5aa9ff', '#a78bff', '#ff6ab0', '#46d6c4']

/** Max leagues so every league has ≥2 players and there are fewer leagues than players. */
export function maxLeaguesFor(activePlayers: number): number {
  return Math.max(1, Math.floor(activePlayers / 2))
}

/** First-season layout: split checked-in players into `numLeagues` divisions,
 *  either by rating (strongest in Elite) or randomly. Admin can edit afterwards. */
export function buildInitialDivisions(
  players: Player[],
  numLeagues: number,
  mode: 'elo' | 'random',
): DraftDivision[] {
  let ordered: Player[]
  if (mode === 'elo') {
    ordered = [...players].sort((a, b) => b.elo - a.elo)
  } else {
    ordered = [...players]
    for (let i = ordered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]
    }
  }
  const sizes = manualSizes(ordered.length, numLeagues)
  const divs: DraftDivision[] = []
  let idx = 0
  sizes.forEach((sz, i) => {
    divs.push({
      name: LEAGUE_NAMES[i] ?? `League ${i + 1}`,
      color: LEAGUE_COLORS[i] ?? '#9aa4b2',
      players: ordered.slice(idx, idx + sz),
    })
    idx += sz
  })
  return divs
}

export interface DraftDivision {
  name: string
  color: string
  players: Player[]
}

export interface Series {
  name: string
  seasons: LeagueEvent[] // sorted by season ascending
}

/** Group events into series by name; seasons sorted ascending. */
export function groupSeries(events: LeagueEvent[]): Series[] {
  const map = new Map<string, LeagueEvent[]>()
  for (const e of events) {
    const arr = map.get(e.name) ?? []
    arr.push(e)
    map.set(e.name, arr)
  }
  return [...map.entries()]
    .map(([name, seasons]) => ({ name, seasons: seasons.sort((a, b) => a.season - b.season) }))
    .sort((a, b) => {
      const la = a.seasons[a.seasons.length - 1]
      const lb = b.seasons[b.seasons.length - 1]
      return +new Date(lb.date) - +new Date(la.date)
    })
}

export interface WL {
  wins: number
  losses: number
}

/** Per-player win/loss record for a single season (from that season's matches). */
export function seasonRecords(matches: Match[]): Map<string, WL> {
  const rec = new Map<string, WL>()
  const get = (id: string) => {
    let r = rec.get(id)
    if (!r) {
      r = { wins: 0, losses: 0 }
      rec.set(id, r)
    }
    return r
  }
  for (const m of matches) {
    if (!m.winnerId) continue
    const loserId = m.playerAId === m.winnerId ? m.playerBId : m.playerAId
    get(m.winnerId).wins++
    get(loserId).losses++
  }
  return rec
}

/** Records for everyone who was IN a season (participants seeded at 0-0, then
 *  filled from matches). Players absent from this map are genuinely new. */
export function seasonRecordsFor(detail: EventDetail): Map<string, WL> {
  const rec = new Map<string, WL>()
  for (const l of detail.leagues) for (const p of l.players) rec.set(p.id, { wins: 0, losses: 0 })
  for (const id of detail.event.participantIds) if (!rec.has(id)) rec.set(id, { wins: 0, losses: 0 })
  for (const m of detail.matches) {
    if (!m.winnerId) continue
    const loserId = m.playerAId === m.winnerId ? m.playerBId : m.playerAId
    const w = rec.get(m.winnerId) ?? { wins: 0, losses: 0 }
    w.wins++
    rec.set(m.winnerId, w)
    const l = rec.get(loserId) ?? { wins: 0, losses: 0 }
    l.losses++
    rec.set(loserId, l)
  }
  return rec
}

/** Final standings order (best first) within a league, by wins → game diff → ELO. */
export function standingsOrder(league: LeagueWithPlayers, matches: Match[]): Player[] {
  const ids = new Set(league.players.map((p) => p.id))
  const lm = matches.filter((m) => ids.has(m.playerAId) && ids.has(m.playerBId))
  const score = new Map<string, { wins: number; diff: number }>()
  for (const p of league.players) score.set(p.id, { wins: 0, diff: 0 })
  for (const m of lm) {
    const a = score.get(m.playerAId)!
    const b = score.get(m.playerBId)!
    a.diff += m.scoreA - m.scoreB
    b.diff += m.scoreB - m.scoreA
    if (m.winnerId === m.playerAId) a.wins++
    else if (m.winnerId === m.playerBId) b.wins++
  }
  return [...league.players].sort((p, q) => {
    const sp = score.get(p.id)!
    const sq = score.get(q.id)!
    return sq.wins - sp.wins || sq.diff - sp.diff || q.elo - p.elo
  })
}

/** Promotion/relegation: top N of each division move up, bottom N move down,
 *  based on the previous standings order (best-first per division). */
export function applyPromoteRelegate(orig: Player[][], n: number): Player[][] {
  const last = orig.length - 1
  const promoted: Player[][] = orig.map(() => [])
  const relegated: Player[][] = orig.map(() => [])
  const stayers: Player[][] = orig.map(() => [])

  orig.forEach((div, i) => {
    let up = i === 0 ? 0 : n
    let down = i === last ? 0 : n
    if (up + down > div.length) {
      down = Math.max(0, Math.min(down, div.length))
      up = Math.max(0, div.length - down)
    }
    promoted[i] = div.slice(0, up)
    relegated[i] = div.slice(div.length - down)
    stayers[i] = div.slice(up, div.length - down)
  })

  return orig.map((_, i) => {
    const fromAbove = i > 0 ? relegated[i - 1] : []
    const fromBelow = i < last ? promoted[i + 1] : []
    return [...fromAbove, ...stayers[i], ...fromBelow]
  })
}

/** Global ranking of a season's players by wins → game difference → rating. */
export function globalSeasonRanking(prev: EventDetail): Player[] {
  const players: Player[] = []
  for (const l of prev.leagues) for (const p of l.players) players.push(p)
  const stat = new Map<string, { wins: number; diff: number }>()
  for (const p of players) stat.set(p.id, { wins: 0, diff: 0 })
  for (const m of prev.matches) {
    const a = stat.get(m.playerAId)
    const b = stat.get(m.playerBId)
    if (a) {
      a.diff += m.scoreA - m.scoreB
      if (m.winnerId === m.playerAId) a.wins++
    }
    if (b) {
      b.diff += m.scoreB - m.scoreA
      if (m.winnerId === m.playerBId) b.wins++
    }
  }
  return [...players].sort((p, q) => {
    const sp = stat.get(p.id)!
    const sq = stat.get(q.id)!
    return sq.wins - sp.wins || sq.diff - sp.diff || q.elo - p.elo
  })
}

/** Next-season layout: re-rank EVERY player by last season's wins and slot them
 *  top-down into the same number of divisions. Division 1 = most wins, so a 2-2
 *  player outranks a 0-0 player regardless of which division they were in. */
export function computeNextSeasonDivisions(prev: EventDetail): DraftDivision[] {
  const ranked = globalSeasonRanking(prev)
  const numDiv = Math.max(1, prev.leagues.length)
  const sizes = manualSizes(ranked.length, numDiv)
  const divs: DraftDivision[] = []
  let idx = 0
  sizes.forEach((sz, i) => {
    divs.push({
      name: LEAGUE_NAMES[i] ?? `Division ${i + 1}`,
      color: LEAGUE_COLORS[i] ?? '#9aa4b2',
      players: ranked.slice(idx, idx + sz),
    })
    idx += sz
  })
  return divs
}

/** Persist a new season from an explicit (admin-adjusted) division layout. */
export async function createSeasonFromDivisions(
  seriesName: string,
  season: number,
  divisions: DraftDivision[],
): Promise<string> {
  const { data: ev, error } = await supabase
    .from('rally_events')
    .insert({
      name: seriesName,
      duration_min: season,
      tables: divisions.length,
      set_minutes: 0,
      with_qualifier: false,
      status: 'live',
    })
    .select()
    .single()
  if (error) throw error
  const eventId = ev.id as string

  const leaguePayload = divisions.map((d, i) => ({
    event_id: eventId,
    name: d.name,
    tier: i + 1,
    color: d.color,
    format: i === 0 ? 'Best of 3 to 11' : '1 set to 11',
  }))
  const { data: leagueRows, error: lErr } = await supabase
    .from('rally_leagues')
    .insert(leaguePayload)
    .select()
  if (lErr) throw lErr
  const byTier = [...(leagueRows ?? [])].sort((a, b) => a.tier - b.tier)

  const partRows: Record<string, any>[] = []
  divisions.forEach((d, i) => {
    d.players.forEach((p, seed) => {
      partRows.push({ event_id: eventId, player_id: p.id, league_id: byTier[i].id, seed: seed + 1 })
    })
  })
  if (partRows.length) {
    const { error: pErr } = await supabase
      .from('rally_event_participants')
      .upsert(partRows, { onConflict: 'event_id,player_id' })
    if (pErr) throw pErr
  }
  return eventId
}
