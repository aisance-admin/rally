import { supabase } from './supabase'
import { manualSizes } from './planner'
import { parseSeriesName } from './seasons'
import type { EventDetail, LeagueWithPlayers, Match, Player } from '../types'

const DIV_PRESET = [
  { name: 'Elite', color: '#ff2d55' },
  { name: 'Division 1', color: '#ff6321' },
  { name: 'Division 2', color: '#f0a93b' },
  { name: 'Division 3', color: '#5ec26a' },
  { name: 'Division 4', color: '#9aa4b2' },
  { name: 'Division 5', color: '#6ea8ff' },
  { name: 'Division 6', color: '#b06eff' },
]

export interface EventConfig {
  name: string
  tables: number
  durationMin: number
  setMinutes: number
  withQualifier: boolean
}

const toMatch = (r: Record<string, any>): Match => ({
  id: r.id,
  playerAId: r.player_a,
  playerBId: r.player_b,
  scoreA: r.score_a,
  scoreB: r.score_b,
  sets: (r.sets ?? null) as Match['sets'],
  winnerId: r.winner_id,
  eloDeltaWinner: r.elo_delta_winner,
  eloDeltaLoser: r.elo_delta_loser,
  divisionId: r.division_id,
  format: r.format,
  status: (r.status ?? 'final') as Match['status'],
  playedAt: r.played_at,
})

const toPlayer = (r: Record<string, any>): Player => ({
  id: r.id,
  name: r.name,
  handle: r.handle,
  country: r.country ?? '🏓',
  elo: r.elo,
  peakElo: r.peak_elo,
  wins: r.wins,
  losses: r.losses,
  form: (r.form ?? []) as ('W' | 'L')[],
  divisionId: r.division_id,
  history: (r.history ?? []) as number[],
  joinedAt: r.created_at,
})

async function insertEvent(config: EventConfig, status: string): Promise<string> {
  const { data, error } = await supabase
    .from('rally_events')
    .insert({
      name: config.name,
      tables: config.tables,
      duration_min: config.durationMin,
      set_minutes: config.setMinutes,
      with_qualifier: config.withQualifier,
      status,
    })
    .select()
    .single()
  if (error) throw error
  return data.id as string
}

/** Create tiered leagues (Elite, Div 1, …) from a rank-sorted player list and
 *  (re)assign participants into them. The admin sets `numLeagues` manually. */
async function buildTieredLeagues(eventId: string, ranked: Player[], numLeagues: number): Promise<void> {
  const sizes = manualSizes(ranked.length, numLeagues)
  const leaguePayload = sizes.map((size, i) => {
    const preset = DIV_PRESET[i] ?? { name: `League ${i + 1}`, color: '#9aa4b2' }
    const format = size === 5 ? 'pools→playoff' : i === 0 ? 'Best of 3 to 11' : '1 set to 11'
    return { event_id: eventId, name: preset.name, tier: i + 1, color: preset.color, format }
  })
  const { data: leagueRows, error: lErr } = await supabase
    .from('rally_leagues')
    .insert(leaguePayload)
    .select()
  if (lErr) throw lErr
  const leaguesByTier = [...(leagueRows ?? [])].sort((a, b) => a.tier - b.tier)

  const partRows: Record<string, any>[] = []
  let idx = 0
  for (let i = 0; i < sizes.length; i++) {
    for (let s = 0; s < sizes[i]; s++) {
      const p = ranked[idx]
      partRows.push({ event_id: eventId, player_id: p.id, league_id: leaguesByTier[i].id, seed: idx + 1 })
      idx++
    }
  }
  const { error: pErr } = await supabase
    .from('rally_event_participants')
    .upsert(partRows, { onConflict: 'event_id,player_id' })
  if (pErr) throw pErr
}

/** Mode A — seed `numLeagues` leagues directly by current ELO / leaderboard rank. */
export async function createEventWithLeagues(
  config: EventConfig,
  participants: Player[],
  numLeagues: number,
): Promise<string> {
  const ranked = [...participants].sort((a, b) => b.elo - a.elo)
  const eventId = await insertEvent(config, 'live')
  await buildTieredLeagues(eventId, ranked, numLeagues)
  return eventId
}

/** Mode B (step 1) — create a qualification round: all players in one pool,
 *  random pairings, status 'qualifying'. Leagues are formed afterwards from results. */
export async function createQualifierEvent(
  config: EventConfig,
  participants: Player[],
): Promise<string> {
  const eventId = await insertEvent(config, 'qualifying')
  const { data: lg, error: lErr } = await supabase
    .from('rally_leagues')
    .insert({ event_id: eventId, name: 'Qualification', tier: 0, color: '#ff5500', format: '1 set to 11' })
    .select()
    .single()
  if (lErr) throw lErr
  const partRows = participants.map((p, i) => ({
    event_id: eventId,
    player_id: p.id,
    league_id: lg.id,
    seed: i + 1,
  }))
  const { error: pErr } = await supabase
    .from('rally_event_participants')
    .upsert(partRows, { onConflict: 'event_id,player_id' })
  if (pErr) throw pErr
  return eventId
}

/** Mode B (step 2) — after qualifier matches, rank by (now-calibrated) ELO,
 *  build the chosen number of tiered leagues, drop the qualifier pool, and go live. */
export async function promoteQualifierToLeagues(eventId: string, numLeagues: number): Promise<void> {
  const partRes = await supabase
    .from('rally_event_participants')
    .select('player_id')
    .eq('event_id', eventId)
  const ids = (partRes.data ?? []).map((p) => p.player_id)
  if (!ids.length) return
  const plRes = await supabase.from('rally_players').select('*').in('id', ids)
  const ranked = (plRes.data ?? []).map(toPlayer).sort((a, b) => b.elo - a.elo)

  await buildTieredLeagues(eventId, ranked, numLeagues)
  // remove the qualifier pool (tier 0); its matches keep event_id, league_id -> null
  await supabase.from('rally_leagues').delete().eq('event_id', eventId).eq('tier', 0)
  await supabase.from('rally_events').update({ status: 'live' }).eq('id', eventId)
}

export async function fetchEventDetail(eventId: string): Promise<EventDetail> {
  const [evRes, lgRes, partRes, mRes] = await Promise.all([
    supabase.from('rally_events').select('*').eq('id', eventId).single(),
    supabase.from('rally_leagues').select('*').eq('event_id', eventId).order('tier'),
    supabase.from('rally_event_participants').select('*').eq('event_id', eventId),
    supabase.from('rally_matches').select('*').eq('event_id', eventId).order('played_at'),
  ])
  if (evRes.error) throw evRes.error

  const parts = partRes.data ?? []
  const ids = parts.map((p) => p.player_id)
  const plRes = ids.length
    ? await supabase.from('rally_players').select('*').in('id', ids)
    : { data: [] as Record<string, any>[] }
  const playersById = Object.fromEntries((plRes.data ?? []).map((r) => [r.id, toPlayer(r)]))
  const leagues: LeagueWithPlayers[] = (lgRes.data ?? []).map((l) => ({
    id: l.id,
    eventId,
    name: l.name,
    tier: l.tier,
    color: l.color,
    format: l.format,
    validatedAt: l.validated_at ?? null,
    players: parts
      .filter((pp) => pp.league_id === l.id)
      .map((pp) => playersById[pp.player_id])
      .filter(Boolean)
      .sort((a, b) => b.elo - a.elo),
  }))

  const e = evRes.data
  const parsed = parseSeriesName(e.name)
  return {
    event: {
      id: e.id,
      seriesId: parsed.seriesId,
      name: parsed.name,
      date: e.date,
      tables: e.tables,
      durationMin: e.duration_min,
      season: e.duration_min ?? 1,
      participantIds: parts.map((p) => p.player_id),
      status: e.status,
    },
    leagues,
    matches: (mRes.data ?? []).map(toMatch),
  }
}

export async function finishEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('rally_events').update({ status: 'done' }).eq('id', eventId)
  if (error) throw error
}

/** Reopen a finished season for corrections — enforced at the data layer: only
 *  the latest season of its series may reopen; once a later season exists the
 *  correction window is permanently closed (spec §5d). */
export async function reopenEvent(eventId: string): Promise<void> {
  const { data: ev, error: e1 } = await supabase.from('rally_events').select('name, duration_min').eq('id', eventId).single()
  if (e1) throw e1
  const { seriesId } = parseSeriesName(ev.name)
  const { data: all } = await supabase.from('rally_events').select('name, duration_min').limit(2000)
  const laterExists = (all ?? []).some((e) => parseSeriesName(e.name).seriesId === seriesId && (e.duration_min ?? 0) > (ev.duration_min ?? 0))
  if (laterExists) throw new Error('A later season already exists — this season is permanently locked.')
  const { error } = await supabase.from('rally_events').update({ status: 'live' }).eq('id', eventId)
  if (error) throw error
}

export interface PlayerSeason {
  seriesId: string
  seriesName: string
  season: number
  status: string
  divisionName: string
  divisionColor: string
  tier: number
}

/** A player's division in every season they played — for the per-player
 *  division-across-seasons view (spec §8). */
export async function fetchPlayerSeasons(playerId: string): Promise<PlayerSeason[]> {
  const partRes = await supabase.from('rally_event_participants').select('event_id, league_id').eq('player_id', playerId)
  if (partRes.error) throw partRes.error
  const parts = partRes.data ?? []
  if (!parts.length) return []
  const eventIds = [...new Set(parts.map((p) => p.event_id))]
  const leagueIds = [...new Set(parts.map((p) => p.league_id).filter(Boolean))]
  const [evRes, lgRes] = await Promise.all([
    supabase.from('rally_events').select('id, name, duration_min, status').in('id', eventIds),
    leagueIds.length ? supabase.from('rally_leagues').select('id, name, color, tier').in('id', leagueIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const evById = Object.fromEntries((evRes.data ?? []).map((e) => [e.id, e]))
  const lgById = Object.fromEntries((lgRes.data ?? []).map((l) => [l.id, l]))
  const rows: PlayerSeason[] = []
  for (const p of parts) {
    const ev = evById[p.event_id], lg = lgById[p.league_id]
    if (!ev || !lg) continue
    const { name, seriesId } = parseSeriesName(ev.name)
    rows.push({ seriesId, seriesName: name, season: ev.duration_min ?? 1, status: ev.status, divisionName: lg.name, divisionColor: lg.color, tier: lg.tier })
  }
  return rows.sort((a, b) => a.seriesName.localeCompare(b.seriesName) || a.season - b.season)
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('rally_events').delete().eq('id', eventId)
  if (error) throw error
}
