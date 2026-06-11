import { supabase } from './supabase'
import type { EventDetail, LeagueEvent, LeagueWithPlayers, Match, Player } from '../types'

export const LEAGUE_NAMES = ['Elite', 'Division 1', 'Division 2', 'Division 3', 'Division 4', 'Division 5', 'Division 6', 'Division 7']
export const LEAGUE_COLORS = ['#ff2d55', '#ff6321', '#f0a93b', '#5ec26a', '#9aa4b2', '#6ea8ff', '#b06eff', '#46d6c4']

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

/** Build the default division layout for the next season from a finished season. */
export function computeNextSeasonDivisions(prev: EventDetail, promoteN: number): DraftDivision[] {
  const orig = [...prev.leagues]
    .sort((a, b) => a.tier - b.tier)
    .map((l) => standingsOrder(l, prev.matches))
  const moved = applyPromoteRelegate(orig, promoteN)
  return moved.map((players, i) => ({
    name: LEAGUE_NAMES[i] ?? `League ${i + 1}`,
    color: LEAGUE_COLORS[i] ?? '#9aa4b2',
    players,
  }))
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
