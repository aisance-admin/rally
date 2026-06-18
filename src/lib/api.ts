import { supabase } from './supabase'
import type { AppData, Division, LeagueEvent, Match, MatchStatus, Player, SetScore } from '../types'
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
  sets: (r.sets ?? null) as Match['sets'],
  winnerId: r.winner_id,
  eloDeltaWinner: r.elo_delta_winner,
  eloDeltaLoser: r.elo_delta_loser,
  divisionId: r.division_id,
  format: r.format,
  status: (r.status ?? 'final') as Match['status'],
  round: r.round ?? null,
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

// ---------- record / edit / delete a match (with ELO reversal) ----------
export interface RecordMatchInput {
  matchId?: string | null // present = edit an existing row
  winnerId: string
  loserId: string
  winnerScore: number
  loserScore: number
  sets?: SetScore[] | null
  format: string
  status?: MatchStatus // default 'final'; 'wl' = win/loss only; 'rank' = synthesized, no ELO
  round?: number | null // 1 = synthesized rank row from a confirmed random draw
  eventId?: string | null
  leagueId?: string | null
}

/** Local-update payload returned so the UI can patch state without a full refetch. */
export interface PlayerPatch {
  id: string
  elo: number
  peakElo: number
  wins: number
  losses: number
  form: ('W' | 'L')[]
  history: number[]
  divisionId: string
}
export interface MatchOpResult {
  match?: Match
  removedId?: string
  patches: PlayerPatch[]
}

const formFromMatches = (pid: string, matches: Match[]): ('W' | 'L')[] =>
  matches
    .filter((m) => (m.playerAId === pid || m.playerBId === pid) && (m.status === 'final' || m.status === 'wl'))
    .slice()
    .sort((a, b) => +new Date(b.playedAt) - +new Date(a.playedAt))
    .slice(0, 8)
    .map((m) => (m.winnerId === pid ? 'W' : 'L'))

async function writePlayer(p: PlayerPatch) {
  const { error } = await supabase
    .from('rally_players')
    .update({ elo: p.elo, peak_elo: p.peakElo, wins: p.wins, losses: p.losses, form: p.form, history: p.history, division_id: p.divisionId })
    .eq('id', p.id)
  if (error) throw error
}

/** Record a new match OR edit an existing one. Reverses the old row's ELO/W-L first
 *  (when editing), then applies the new result. 'rank' rows never touch ELO/players. */
export async function recordMatch(input: RecordMatchInput, players: Player[], allMatches: Match[]): Promise<MatchOpResult> {
  const status: MatchStatus = input.status ?? 'final'
  const existing = input.matchId ? allMatches.find((m) => m.id === input.matchId) ?? null : null

  // reverse the existing row's effect (in-memory) so the base is "as if it never happened"
  let base = players.map((p) => ({ ...p }))
  let matchesWithout = allMatches
  if (existing) {
    matchesWithout = allMatches.filter((m) => m.id !== existing.id)
    if (existing.status !== 'rank') {
      const loserId = existing.playerAId === existing.winnerId ? existing.playerBId : existing.playerAId
      base = base.map((p) =>
        p.id === existing.winnerId ? { ...p, elo: p.elo - existing.eloDeltaWinner, wins: Math.max(0, p.wins - 1) }
        : p.id === loserId ? { ...p, elo: p.elo - existing.eloDeltaLoser, losses: Math.max(0, p.losses - 1) }
        : p,
      )
    }
  }

  const winner = base.find((p) => p.id === input.winnerId)
  const loser = base.find((p) => p.id === input.loserId)
  if (!winner || !loser) throw new Error('player not found')

  const wScore = status === 'wl' || status === 'rank' ? 1 : Math.max(input.winnerScore, input.loserScore)
  const lScore = status === 'wl' || status === 'rank' ? 0 : Math.min(input.winnerScore, input.loserScore)
  let wDelta = 0, lDelta = 0, wElo = winner.elo, lElo = loser.elo
  if (status !== 'rank') {
    const res = applyElo(winner.elo, loser.elo)
    wDelta = res.winnerDelta; lDelta = res.loserDelta; wElo = res.newWinnerElo; lElo = res.newLoserElo
  }

  const row = {
    event_id: input.eventId ?? null,
    league_id: input.leagueId ?? null,
    player_a: winner.id,
    player_b: loser.id,
    score_a: wScore,
    score_b: lScore,
    sets: input.sets ?? null,
    winner_id: winner.id,
    elo_delta_winner: wDelta,
    elo_delta_loser: lDelta,
    format: input.format,
    division_id: winner.divisionId,
    status,
    round: input.round ?? null,
  }

  const q = existing
    ? supabase.from('rally_matches').update(row).eq('id', existing.id).select().single()
    : supabase.from('rally_matches').insert(row).select().single()
  const { data, error } = await q
  if (error) throw error
  const match = toMatch(data)

  const patches: PlayerPatch[] = []
  const matchesNow = [...matchesWithout, match]
  if (status !== 'rank') {
    const wHist = [...winner.history, wElo].slice(-40)
    const lHist = [...loser.history, lElo].slice(-40)
    patches.push(
      { id: winner.id, elo: wElo, peakElo: Math.max(winner.peakElo, wElo), wins: winner.wins + 1, losses: winner.losses, form: formFromMatches(winner.id, matchesNow), history: wHist, divisionId: divisionForElo(wElo) },
      { id: loser.id, elo: lElo, peakElo: Math.max(loser.peakElo, lElo), wins: loser.wins, losses: loser.losses + 1, form: formFromMatches(loser.id, matchesNow), history: lHist, divisionId: divisionForElo(lElo) },
    )
  } else if (existing && existing.status !== 'rank') {
    // editing a scored row down to 'rank' — persist the reversal only
    for (const p of base) if (p.id === winner.id || p.id === loser.id)
      patches.push({ id: p.id, elo: p.elo, peakElo: p.peakElo, wins: p.wins, losses: p.losses, form: formFromMatches(p.id, matchesNow), history: p.history, divisionId: divisionForElo(p.elo) })
  }
  await Promise.all(patches.map(writePlayer))
  return { match, patches }
}

/** Delete a match, reversing its ELO/W-L effect on both players. */
export async function deleteMatch(matchId: string, players: Player[], allMatches: Match[]): Promise<MatchOpResult> {
  const existing = allMatches.find((m) => m.id === matchId)
  if (!existing) return { removedId: matchId, patches: [] }
  const matchesWithout = allMatches.filter((m) => m.id !== matchId)
  const patches: PlayerPatch[] = []
  if (existing.status !== 'rank') {
    const loserId = existing.playerAId === existing.winnerId ? existing.playerBId : existing.playerAId
    for (const p of players) {
      if (p.id === existing.winnerId) {
        const elo = p.elo - existing.eloDeltaWinner
        patches.push({ id: p.id, elo, peakElo: p.peakElo, wins: Math.max(0, p.wins - 1), losses: p.losses, form: formFromMatches(p.id, matchesWithout), history: p.history, divisionId: divisionForElo(elo) })
      } else if (p.id === loserId) {
        const elo = p.elo - existing.eloDeltaLoser
        patches.push({ id: p.id, elo, peakElo: p.peakElo, wins: p.wins, losses: Math.max(0, p.losses - 1), form: formFromMatches(p.id, matchesWithout), history: p.history, divisionId: divisionForElo(elo) })
      }
    }
  }
  const { error } = await supabase.from('rally_matches').delete().eq('id', matchId)
  if (error) throw error
  await Promise.all(patches.map(writePlayer))
  return { removedId: matchId, patches }
}

/** Lock / unlock a division (group validation). */
export async function validateLeague(leagueId: string, on: boolean): Promise<void> {
  const { error } = await supabase
    .from('rally_leagues')
    .update({ validated_at: on ? new Date().toISOString() : null })
    .eq('id', leagueId)
  if (error) throw error
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

// ---------- full backup: export / import ----------
export interface Backup {
  rally: true
  version: 1
  exportedAt: string
  tables: {
    rally_divisions: Row[]
    rally_players: Row[]
    rally_events: Row[]
    rally_leagues: Row[]
    rally_event_participants: Row[]
    rally_matches: Row[]
  }
}

/** Read every RALLY table verbatim for a downloadable JSON backup. */
export async function exportAll(): Promise<Backup> {
  const [divisions, players, events, leagues, participants, matches] = await Promise.all([
    supabase.from('rally_divisions').select('*'),
    supabase.from('rally_players').select('*'),
    supabase.from('rally_events').select('*'),
    supabase.from('rally_leagues').select('*'),
    supabase.from('rally_event_participants').select('*'),
    supabase.from('rally_matches').select('*'),
  ])
  for (const r of [divisions, players, events, leagues, participants, matches]) if (r.error) throw r.error
  return {
    rally: true,
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {
      rally_divisions: divisions.data ?? [],
      rally_players: players.data ?? [],
      rally_events: events.data ?? [],
      rally_leagues: leagues.data ?? [],
      rally_event_participants: participants.data ?? [],
      rally_matches: matches.data ?? [],
    },
  }
}

/** Wipe everything and restore a backup verbatim (ids preserved), inserted in
 *  FK-safe order. Parents before children. */
export async function importAll(backup: Backup): Promise<void> {
  if (!backup?.rally || !backup.tables) throw new Error('Not a RALLY backup file.')
  await clearAll()
  const t = backup.tables
  const insert = async (table: string, rows: Row[]) => {
    if (!rows?.length) return
    const { error } = await supabase.from(table).insert(rows)
    if (error) throw error
  }
  // divisions are kept by clearAll; upsert in case the backup has different ones
  if (t.rally_divisions?.length) {
    const { error } = await supabase.from('rally_divisions').upsert(t.rally_divisions, { onConflict: 'id' })
    if (error) throw error
  }
  await insert('rally_players', t.rally_players)
  await insert('rally_events', t.rally_events)
  await insert('rally_leagues', t.rally_leagues)
  await insert('rally_event_participants', t.rally_event_participants)
  await insert('rally_matches', t.rally_matches)
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
