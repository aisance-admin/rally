import { supabase } from './supabase'
import type { AppData, Division, LeagueEvent, Match, Player } from '../types'
import { applyElo } from './elo'
import { buildMockData, divisionForElo } from './mockData'
import { parseSeriesName } from './seasons'

// ---------- row mappers ----------
type Row = Record<string, any>

const toPlayer = (r: Row): Player => ({
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

const toDivision = (r: Row): Division => ({
  id: r.id,
  name: r.name,
  tier: r.tier,
  color: r.color,
  eloFloor: r.elo_floor,
})

const toMatch = (r: Row): Match => ({
  id: r.id,
  playerAId: r.player_a,
  playerBId: r.player_b,
  scoreA: r.score_a,
  scoreB: r.score_b,
  winnerId: r.winner_id,
  eloDeltaWinner: r.elo_delta_winner,
  eloDeltaLoser: r.elo_delta_loser,
  divisionId: r.division_id,
  format: r.format,
  playedAt: r.played_at,
})

const toEvent = (r: Row): LeagueEvent => {
  const { name, seriesId } = parseSeriesName(r.name)
  return {
    id: r.id,
    seriesId,
    name,
    date: r.date,
    tables: r.tables,
    durationMin: r.duration_min,
    season: r.duration_min ?? 1,
    participantIds: (r.rally_event_participants ?? []).map((p: Row) => p.player_id),
    status: r.status,
  }
}

// ---------- reads ----------
export async function fetchAll(): Promise<AppData> {
  const [players, divisions, matches, events] = await Promise.all([
    supabase.from('rally_players').select('*').order('elo', { ascending: false }),
    supabase.from('rally_divisions').select('*').order('tier'),
    supabase.from('rally_matches').select('*').order('played_at', { ascending: false }).limit(200),
    supabase
      .from('rally_events')
      .select('*, rally_event_participants(player_id)')
      .order('date', { ascending: false }),
  ])
  if (players.error) throw players.error
  return {
    players: (players.data ?? []).map(toPlayer),
    divisions: (divisions.data ?? []).map(toDivision),
    matches: (matches.data ?? []).map(toMatch),
    events: (events.data ?? []).map(toEvent),
    seeded: (players.data ?? []).length > 0,
  }
}

// ---------- player CRUD ----------
export interface PlayerInput {
  name: string
  handle: string
  country: string
  elo: number
}

export async function createPlayer(input: PlayerInput): Promise<void> {
  const elo = Math.round(input.elo)
  const { error } = await supabase.from('rally_players').insert({
    name: input.name,
    handle: input.handle || input.name.toLowerCase().replace(/\s+/g, '_'),
    country: input.country || '🏓',
    elo,
    peak_elo: elo,
    wins: 0,
    losses: 0,
    form: [],
    history: [elo],
    division_id: divisionForElo(elo),
  })
  if (error) throw error
}

export async function updatePlayer(
  id: string,
  patch: Partial<{ name: string; handle: string; country: string; elo: number }>,
): Promise<void> {
  const update: Row = { ...patch }
  if (patch.elo != null) {
    update.elo = Math.round(patch.elo)
    update.division_id = divisionForElo(update.elo)
  }
  const { error } = await supabase.from('rally_players').update(update).eq('id', id)
  if (error) throw error
}

export async function deletePlayer(id: string): Promise<void> {
  const { error } = await supabase.from('rally_players').delete().eq('id', id)
  if (error) throw error
}

/** Paste-to-bulk-add: one name per line, all start at the same default ELO. */
export async function bulkCreatePlayers(names: string[], defaultElo = 1000): Promise<number> {
  const elo = Math.round(defaultElo)
  const seen = new Set<string>()
  const rows = names
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .filter((n) => {
      const k = n.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .map((name, i) => ({
      name,
      handle:
        name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `player_${i + 1}`,
      country: '🏓',
      elo,
      peak_elo: elo,
      wins: 0,
      losses: 0,
      form: [],
      history: [elo],
      division_id: divisionForElo(elo),
    }))
  if (rows.length === 0) return 0
  const { error } = await supabase.from('rally_players').insert(rows)
  if (error) throw error
  return rows.length
}

// ---------- record a (casual) match ----------
export interface RecordMatchInput {
  winnerId: string
  loserId: string
  winnerScore: number
  loserScore: number
  format: string
  eventId?: string | null
  leagueId?: string | null
}

export async function recordMatch(input: RecordMatchInput, players: Player[]): Promise<void> {
  const winner = players.find((p) => p.id === input.winnerId)
  const loser = players.find((p) => p.id === input.loserId)
  if (!winner || !loser) throw new Error('player not found')
  const res = applyElo(winner.elo, loser.elo)

  const wElo = res.newWinnerElo
  const lElo = res.newLoserElo

  await Promise.all([
    supabase
      .from('rally_players')
      .update({
        elo: wElo,
        peak_elo: Math.max(winner.peakElo, wElo),
        wins: winner.wins + 1,
        form: ['W', ...winner.form].slice(0, 8),
        history: [...winner.history, wElo].slice(-40),
        division_id: divisionForElo(wElo),
      })
      .eq('id', winner.id),
    supabase
      .from('rally_players')
      .update({
        elo: lElo,
        losses: loser.losses + 1,
        form: ['L', ...loser.form].slice(0, 8),
        history: [...loser.history, lElo].slice(-40),
        division_id: divisionForElo(lElo),
      })
      .eq('id', loser.id),
    supabase.from('rally_matches').insert({
      event_id: input.eventId ?? null,
      league_id: input.leagueId ?? null,
      player_a: winner.id,
      player_b: loser.id,
      score_a: Math.max(input.winnerScore, input.loserScore),
      score_b: Math.min(input.winnerScore, input.loserScore),
      winner_id: winner.id,
      elo_delta_winner: res.winnerDelta,
      elo_delta_loser: res.loserDelta,
      format: input.format,
      division_id: winner.divisionId,
      status: 'final',
    }),
  ])
}

// ---------- mock data + wipe ----------
export async function seedMockRoster(): Promise<void> {
  const mock = buildMockData()
  const payload = mock.players.map((p) => ({
    name: p.name,
    handle: p.handle,
    country: p.country,
    elo: p.elo,
    peak_elo: p.peakElo,
    wins: p.wins,
    losses: p.losses,
    form: p.form,
    history: p.history,
    division_id: p.divisionId,
    is_mock: true,
  }))
  const { data, error } = await supabase.from('rally_players').insert(payload).select('id, handle')
  if (error) throw error

  // remap mock matches (which reference seed ids) onto the new DB ids via handle
  const handleToNew: Record<string, string> = {}
  for (const r of data ?? []) handleToNew[r.handle] = r.id
  const seedIdToHandle: Record<string, string> = {}
  for (const p of mock.players) seedIdToHandle[p.id] = p.handle

  const matchRows = mock.matches
    .map((m) => {
      const a = handleToNew[seedIdToHandle[m.playerAId]]
      const b = handleToNew[seedIdToHandle[m.playerBId]]
      const w = handleToNew[seedIdToHandle[m.winnerId]]
      if (!a || !b || !w) return null
      return {
        player_a: a,
        player_b: b,
        score_a: m.scoreA,
        score_b: m.scoreB,
        winner_id: w,
        elo_delta_winner: m.eloDeltaWinner,
        elo_delta_loser: m.eloDeltaLoser,
        format: m.format,
        division_id: m.divisionId,
        played_at: m.playedAt,
        status: 'final',
      }
    })
    .filter(Boolean)

  if (matchRows.length) {
    const { error: mErr } = await supabase.from('rally_matches').insert(matchRows as Row[])
    if (mErr) throw mErr
  }
}

export async function clearAll(): Promise<void> {
  // children first (FKs), divisions are kept as reference data
  await supabase.from('rally_matches').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase
    .from('rally_event_participants')
    .delete()
    .neq('event_id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('rally_leagues').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('rally_events').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('rally_players').delete().neq('id', '00000000-0000-0000-0000-000000000000')
}

export type { Row }
