import { supabase } from './supabase'
import { manualSizes } from './planner'
import type { EventDetail, LeagueEvent, LeagueWithPlayers, Match, Player } from '../types'

export const LEAGUE_NAMES = ['Division 1', 'Division 2', 'Division 3', 'Division 4', 'Division 5', 'Division 6', 'Division 7', 'Division 8']
export const LEAGUE_COLORS = ['#ff5a3c', '#ff8a3d', '#ffc24b', '#5ed6a0', '#5aa9ff', '#a78bff', '#ff6ab0', '#46d6c4']

/** Max leagues so every league has ≥2 players and there are fewer leagues than players. */
export function maxLeaguesFor(activePlayers: number): number {
  return Math.max(1, Math.floor(activePlayers / 2))
}

// Seeding methods (spec §1). The "seed list" is the players in best→worst order
// (set manually; defaults to rating). 'random' ignores the order.
export type FormationMode = 'block' | 'snake' | 'pots' | 'random' | 'manual'

const buildNames = (groups: Player[][]): DraftDivision[] =>
  groups.map((players, i) => ({ name: LEAGUE_NAMES[i] ?? `League ${i + 1}`, color: LEAGUE_COLORS[i] ?? '#9aa4b2', players }))

function splitSequential(arr: Player[], sizes: number[]): Player[][] {
  const out: Player[][] = []
  let idx = 0
  for (const sz of sizes) { out.push(arr.slice(idx, idx + sz)); idx += sz }
  return out
}

/** Deterministic seeded shuffle (so a draw is stable per `seed` and testable). */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = (seed >>> 0) || 1
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/** Snake / serpentine: deal the seed list across the groups, forward then backward
 *  each pass. 16 seeds / 4 groups → G1[1,8,9,16], G2[2,7,10,15], G3[3,6,11,14], G4[4,5,12,13]. */
export function snakeAssign(seed: Player[], sizes: number[]): Player[][] {
  const groups: Player[][] = sizes.map(() => [])
  const G = groups.length
  let idx = 0, pass = 0
  while (idx < seed.length) {
    const seq = pass % 2 === 0 ? [...Array(G).keys()] : [...Array(G).keys()].reverse()
    let placed = false
    for (const g of seq) {
      if (idx >= seed.length) break
      if (groups[g].length < sizes[g]) { groups[g].push(seed[idx++]); placed = true }
    }
    if (!placed) break
    pass++
  }
  return groups
}

/** Seeded pots (World-Cup): split the seed list into pots of one-per-group, then
 *  draw each pot randomly so every group gets one player from each pot. */
export function potsAssign(seed: Player[], sizes: number[], seedNum: number): Player[][] {
  const G = sizes.length
  const groups: Player[][] = sizes.map(() => [])
  const pots: Player[][] = []
  for (let i = 0; i < seed.length; i += G) pots.push(seed.slice(i, i + G))
  pots.forEach((pot, pi) => {
    const shuffled = seededShuffle(pot, (seedNum + 1) * 7919 + pi)
    const avail = groups.map((_, g) => g).filter((g) => groups[g].length < sizes[g])
    shuffled.forEach((p, j) => groups[avail[j % avail.length]].push(p))
  })
  return groups
}

/** First-season / qualifier layout from a seed list (best→worst). Methods: block
 *  (top-down), snake, pots, random (ignores order), manual (empty groups to fill). */
export function buildInitialDivisions(
  seed: Player[],
  numLeagues: number,
  mode: FormationMode,
  opts: { reseed?: number } = {},
): DraftDivision[] {
  if (mode === 'manual') return buildNames(Array.from({ length: Math.max(1, numLeagues) }, () => [] as Player[]))
  const sizes = manualSizes(seed.length, numLeagues)
  if (mode === 'snake') return buildNames(snakeAssign(seed, sizes))
  if (mode === 'pots') return buildNames(potsAssign(seed, sizes, opts.reseed ?? 1))
  if (mode === 'random') return buildNames(splitSequential(seededShuffle(seed, opts.reseed ?? 1), sizes))
  return buildNames(splitSequential(seed, sizes)) // 'block' — top-down
}

export interface DraftDivision {
  name: string
  color: string
  players: Player[]
  startScore?: number // per-group handicap: matches start from this score (spec §1)
}

export interface Series {
  seriesId: string
  name: string
  seasons: LeagueEvent[] // sorted by season ascending
}

// Each league gets its own series id so two leagues stay separate even if they
// share a display name. We pack it into the event `name` (no schema change):
// "<display name>␟<seriesId>". Legacy rows with no marker group by their name.
const SERIES_DELIM = '␟'

export function encodeSeriesName(displayName: string, seriesId: string): string {
  return `${displayName}${SERIES_DELIM}${seriesId}`
}

export function parseSeriesName(raw: string): { name: string; seriesId: string } {
  const i = raw.indexOf(SERIES_DELIM)
  if (i < 0) return { name: raw, seriesId: raw }
  return { name: raw.slice(0, i), seriesId: raw.slice(i + 1) }
}

/** Group events into leagues by series id; one card per league, seasons ascending. */
export function groupSeries(events: LeagueEvent[]): Series[] {
  const map = new Map<string, LeagueEvent[]>()
  for (const e of events) {
    const arr = map.get(e.seriesId) ?? []
    arr.push(e)
    map.set(e.seriesId, arr)
  }
  return [...map.values()]
    .map((seasons) => {
      const sorted = seasons.sort((a, b) => a.season - b.season)
      return { seriesId: sorted[0].seriesId, name: sorted[0].name, seasons: sorted }
    })
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

// ───────────────────────── ranking / tie-break engine (spec §2) ─────────────────────────

export type TieReason =
  | null
  | 'H2H' // head-to-head decided it
  | 'mini-wins' // wins within the tied group
  | 'mini-sets' // set diff within the tied group (best-of-N)
  | 'mini-pts' // point balance within the tied group (spec step 3a) → "pts (H2H)"
  | 'total-sets' // total set diff across all group matches (best-of-N)
  | 'total-pts' // total point diff across all group matches (spec step 3b)
  | 'needs-pts' // tied; can't resolve without real scores (win/loss entry) → prompt for points
  | 'draw-needed' // total equality, not yet resolved — organizer must confirm a random draw (spec step 4)
  | 'draw' // placement was decided by a confirmed random draw

export interface RankOpts {
  multiSet?: boolean
  seed?: number
}

export interface RankedPlayer {
  player: Player
  played: number
  wins: number
  pointDiff: number
  setDiff: number
  reason: TieReason
}

/** Match format → number of sets and points-per-set. "Best of 3 to 11" → {3,11}. */
export function parseFormat(format: string): { sets: number; pointsTo: number } {
  const f = (format ?? '').toLowerCase()
  const bo = f.match(/best of (\d+)/) ?? f.match(/bo\s*(\d+)/)
  const pts = f.match(/to (\d+)/)
  return { sets: bo ? parseInt(bo[1], 10) : 1, pointsTo: pts ? parseInt(pts[1], 10) : 11 }
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Set difference toward player A (+ if A leads). Single-set falls back to ±1 by winner. */
function setDiffOf(m: Match): number {
  if (m.sets && m.sets.length) return m.sets.reduce((s, st) => s + (st.a > st.b ? 1 : st.b > st.a ? -1 : 0), 0)
  return m.winnerId === m.playerAId ? 1 : -1
}

/**
 * Rank players within ONE division using the head-to-head cascade (spec §2).
 * Primary = matches won. Ties resolved by: A) head-to-head, B) mini-table among
 * the tied players (wins, then sets [best-of-N], then point balance), C) results
 * vs players outside the tie, D) re-apply, E) random draw. Point-based steps need
 * real scores; when matches are win/loss-only a tie is flagged 'needs-pts'.
 */
export function rankDivision(players: Player[], matches: Match[], opts: RankOpts = {}): RankedPlayer[] {
  const ids = new Set(players.map((p) => p.id))
  // 'pending' = submitted but not yet organizer-validated → never affects live standings (§9).
  const lm = matches.filter((m) => m.winnerId && m.status !== 'pending' && ids.has(m.playerAId) && ids.has(m.playerBId))

  const stat = new Map<string, { played: number; wins: number; pts: number; sets: number }>()
  for (const p of players) stat.set(p.id, { played: 0, wins: 0, pts: 0, sets: 0 })
  for (const m of lm) {
    const a = stat.get(m.playerAId)!
    const b = stat.get(m.playerBId)!
    a.played++; b.played++
    a.pts += m.scoreA - m.scoreB; b.pts += m.scoreB - m.scoreA
    const sd = setDiffOf(m)
    a.sets += sd; b.sets -= sd
    if (m.winnerId === m.playerAId) a.wins++
    else if (m.winnerId === m.playerBId) b.wins++
  }

  const between = (x: string, y: string) =>
    lm.filter((m) => (m.playerAId === x && m.playerBId === y) || (m.playerAId === y && m.playerBId === x))
  const winsAmong = (pid: string, grp: Player[]) => {
    let w = 0
    for (const q of grp) if (q.id !== pid) for (const m of between(pid, q.id)) if (m.winnerId === pid) w++
    return w
  }
  const ptsVs = (pid: string, against: Player[]) => {
    let d = 0
    for (const q of against) if (q.id !== pid) for (const m of between(pid, q.id)) d += m.playerAId === pid ? m.scoreA - m.scoreB : m.scoreB - m.scoreA
    return d
  }
  const setsVs = (pid: string, against: Player[]) => {
    let d = 0
    for (const q of against) if (q.id !== pid) for (const m of between(pid, q.id)) { const sd = setDiffOf(m); d += m.playerAId === pid ? sd : -sd }
    return d
  }
  const allFinalAmong = (grp: Player[]) => {
    for (let i = 0; i < grp.length; i++)
      for (let j = i + 1; j < grp.length; j++)
        if (between(grp[i].id, grp[j].id).some((m) => m.status !== 'final')) return false
    return true
  }

  const partition = (group: Player[], metric: (p: Player) => number): Player[][] => {
    const byVal = new Map<number, Player[]>()
    for (const p of group) {
      const v = metric(p)
      const arr = byVal.get(v) ?? []
      arr.push(p)
      byVal.set(v, arr)
    }
    return [...byVal.keys()].sort((a, b) => b - a).map((v) => byVal.get(v)!)
  }

  function breakTie(group: Player[]): { player: Player; reason: TieReason }[] {
    if (group.length === 1) return [{ player: group[0], reason: null }]
    const outside = players.filter((p) => !group.includes(p))

    const trySplit = (metric: (p: Player) => number, reason: TieReason) => {
      const buckets = partition(group, metric)
      if (buckets.length <= 1) return null
      const out: { player: Player; reason: TieReason }[] = []
      for (const b of buckets) {
        if (b.length === 1) out.push({ player: b[0], reason })
        else out.push(...breakTie(b).map((r) => ({ player: r.player, reason: r.reason ?? reason })))
      }
      return out
    }

    // Step 2 — head-to-head wins among the tied players.
    let r = trySplit((p) => winsAmong(p.id, group), group.length === 2 ? 'H2H' : 'mini-wins')
    if (r) return r
    // Step 3a — within the tied players (sets before points for best-of-N).
    if (opts.multiSet) { r = trySplit((p) => setsVs(p.id, group), 'mini-sets'); if (r) return r }
    if (!allFinalAmong(group)) return [...group].sort((a, b) => b.elo - a.elo).map((p) => ({ player: p, reason: 'needs-pts' as TieReason }))
    r = trySplit((p) => ptsVs(p.id, group), 'mini-pts'); if (r) return r
    // Step 3b — total across ALL of the player's group matches (incl. vs non-tied).
    if (opts.multiSet) { r = trySplit((p) => stat.get(p.id)!.sets, 'total-sets'); if (r) return r }
    r = trySplit((p) => stat.get(p.id)!.pts, 'total-pts'); if (r) return r
    // Step 4 — total equality: do NOT auto-resolve; flag for an explicit organizer-confirmed draw.
    return [...group].sort((a, b) => b.elo - a.elo).map((p) => ({ player: p, reason: 'draw-needed' as TieReason }))
  }

  const ordered: { player: Player; reason: TieReason }[] = []
  for (const bucket of partition(players, (p) => stat.get(p.id)!.wins)) {
    if (bucket.length === 1) ordered.push({ player: bucket[0], reason: null })
    else ordered.push(...breakTie(bucket))
  }
  // Players placed by a confirmed random draw (synthesized rank rows flagged round=1).
  const drawnIds = new Set<string>()
  for (const m of lm) if (m.status === 'rank' && m.round === 1) { drawnIds.add(m.playerAId); drawnIds.add(m.playerBId) }
  return ordered.map((o) => {
    const s = stat.get(o.player.id)!
    return { player: o.player, played: s.played, wins: s.wins, pointDiff: s.pts, setDiff: s.sets, reason: drawnIds.has(o.player.id) ? 'draw' : o.reason }
  })
}

/** Final standings order (best first) within a league via the tie-break engine. */
export function standingsOrder(league: LeagueWithPlayers, matches: Match[]): Player[] {
  return rankDivision(league.players, matches, { multiSet: parseFormat(league.format).sets > 1, seed: hash(league.id) }).map((r) => r.player)
}

function ord(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

/** Plain-language explanation of WHY a player sits where they do (spec §2, transparency
 *  principle). Driven by the tie-break `reason` + the equal-wins neighbours. */
export function explainPlacement(playerId: string, ranked: RankedPlayer[], _matches: Match[]): string {
  const idx = ranked.findIndex((r) => r.player.id === playerId)
  if (idx < 0) return ''
  const me = ranked[idx]
  const place = ord(idx + 1)
  const wl = `${me.wins}W–${me.played - me.wins}L`
  // who else finished on the same number of wins
  const sameWins = ranked.filter((r) => r.player.id !== playerId && r.wins === me.wins).map((r) => r.player.name)
  const others =
    sameWins.length === 0 ? '' : sameWins.length === 1 ? sameWins[0] : `${sameWins.slice(0, -1).join(', ')} and ${sameWins.slice(-1)}`
  const above = idx > 0 ? ranked[idx - 1].player.name : null

  switch (me.reason) {
    case null:
      return `${place} on wins (${wl}) — clear, no tie-break needed.`
    case 'H2H':
      return above && sameWins.length
        ? `${place} — tied on wins (${wl}) with ${others}, but ${above} won the head-to-head match against you.`
        : `${place} — won the head-to-head against ${others} after tying on wins (${wl}).`
    case 'mini-wins':
      return `${place} — tied on wins (${wl}) with ${others}; ranked by wins in the matches among the tied players.`
    case 'mini-pts':
      return `${place} — tied on wins (${wl}) and head-to-head with ${others}; separated by point difference in the matches among them.`
    case 'mini-sets':
      return `${place} — tied on wins (${wl}) with ${others}; separated by set difference in the matches among them.`
    case 'total-pts':
      return `${place} — still level with ${others} among themselves; separated by total point difference across all group matches.`
    case 'total-sets':
      return `${place} — still level with ${others} among themselves; separated by total set difference across all group matches.`
    case 'needs-pts':
      return `${place} — level on wins and head-to-head with ${others}. Enter the scores of their matches to rank them.`
    case 'draw-needed':
      return `Total equality with ${others} — everything is identical. Confirm a random draw to set the order.`
    case 'draw':
      return `${place} — placed by a random draw after total equality${others ? ` with ${others}` : ''}.`
    default:
      return `${place} on wins (${wl}).`
  }
}

export interface PromotionConfig {
  up: number
  down: number
  overrides?: Record<number, { up?: number; down?: number }>
}
export const DEFAULT_PROMOTION: PromotionConfig = { up: 1, down: 1 }

function movements(orig: Player[][], cfg: PromotionConfig) {
  const last = orig.length - 1
  return orig.map((div, i) => {
    const o = cfg.overrides?.[i]
    let up = i === 0 ? 0 : Math.max(0, o?.up ?? cfg.up)
    let down = i === last ? 0 : Math.max(0, o?.down ?? cfg.down)
    if (up + down > div.length) {
      down = Math.max(0, Math.min(down, div.length))
      up = Math.max(0, div.length - down)
    }
    return { up, down }
  })
}

/** Persistent promotion/relegation (spec §7): the top `up` of each division move
 *  up one, the bottom `down` move down one (configurable, per-division overrides).
 *  The top division never promotes out; the bottom never relegates out. Middle
 *  players stay — divisions keep their identity. NO global reshuffle. */
export function applyPromoteRelegate(orig: Player[][], cfg: PromotionConfig): Player[][] {
  const last = orig.length - 1
  const mv = movements(orig, cfg)
  const promoted = orig.map((div, i) => div.slice(0, mv[i].up))
  const relegated = orig.map((div, i) => div.slice(div.length - mv[i].down))
  const stayers = orig.map((div, i) => div.slice(mv[i].up, div.length - mv[i].down))
  return orig.map((_, i) => [
    ...(i > 0 ? relegated[i - 1] : []),
    ...stayers[i],
    ...(i < last ? promoted[i + 1] : []),
  ])
}

/** Preview next-season division sizes under a rule; warn when sizes would drift. */
export function previewDivisionSizes(
  orig: Player[][],
  cfg: PromotionConfig,
): { before: number[]; after: number[]; drift: number[]; warning: string | null } {
  const last = orig.length - 1
  const mv = movements(orig, cfg)
  const before = orig.map((d) => d.length)
  const after = orig.map((div, i) => {
    const inFromAbove = i > 0 ? mv[i - 1].down : 0
    const inFromBelow = i < last ? mv[i + 1].up : 0
    return div.length - mv[i].up - mv[i].down + inFromAbove + inFromBelow
  })
  const drift = after.map((a, i) => a - before[i])
  const warning = drift.some((d) => d !== 0)
    ? `Uneven rule — sizes drift to ${after.join(' · ')}. Adjust by hand below if needed.`
    : null
  return { before, after, drift, warning }
}

/** Next-season divisions via persistent promotion/relegation (no global reshuffle):
 *  rank each previous division with the tie-break engine, apply up/down moves,
 *  keep each division's identity (name/color/order). */
export function generateNextSeasonDivisions(
  prev: EventDetail,
  cfg: PromotionConfig = DEFAULT_PROMOTION,
): DraftDivision[] {
  const sorted = [...prev.leagues].sort((a, b) => a.tier - b.tier)
  const orig = sorted.map((l) =>
    rankDivision(l.players, prev.matches, { multiSet: parseFormat(l.format).sets > 1, seed: hash(l.id) }).map((r) => r.player),
  )
  const moved = applyPromoteRelegate(orig, cfg)
  return moved.map((players, i) => ({
    name: sorted[i]?.name ?? LEAGUE_NAMES[i] ?? `Division ${i + 1}`,
    color: sorted[i]?.color ?? LEAGUE_COLORS[i] ?? '#9aa4b2',
    players,
  }))
}

export interface CreateSeasonOpts {
  status?: string // 'live' (default) or 'qualifying' for a pre-season qualifier
  format?: string // match format applied to every division; default '1 set to 11'
}

/** Persist a new season from an explicit (admin-adjusted) division layout. */
export async function createSeasonFromDivisions(
  seriesId: string,
  seriesName: string,
  season: number,
  divisions: DraftDivision[],
  opts: CreateSeasonOpts = {},
): Promise<string> {
  const status = opts.status ?? 'live'
  const format = opts.format ?? '1 set to 11'
  const { data: ev, error } = await supabase
    .from('rally_events')
    .insert({
      name: encodeSeriesName(seriesName, seriesId),
      duration_min: season,
      tables: divisions.length,
      set_minutes: 0,
      with_qualifier: status === 'qualifying',
      status,
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
    format,
    start_score: d.startScore ?? 0,
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

// ───────────────────────── qualifier → divisions (spec §6) ─────────────────────────

/** How to split players of one finishing position when it feeds several divisions. */
export type QualSplit = 'random' | 'points' | 'seed'
/** A finishing position maps to `span` divisions starting at `div` (span 1 = one division). */
export interface PositionRule { div: number; span: number }

/** Default rule for groups of up to `maxPos`: 1st of every group → Division 1,
 *  2nd → Division 2, … (each position feeds exactly one division). */
export function defaultQualifierMapping(maxPos: number): Record<number, PositionRule> {
  const m: Record<number, PositionRule> = {}
  for (let pos = 1; pos <= maxPos; pos++) m[pos] = { div: pos, span: 1 }
  return m
}

/** Build Season-1 divisions from finished qualifier groups (spec §6 / §10.1).
 *  Each finishing position maps to a starting division and a span of divisions;
 *  when a position feeds several divisions, its players are split across them by
 *  `split` (random default, or by qualifier points / by rating) — best to the
 *  higher division. Within a division, higher finishes seed higher. */
export function buildDivisionsFromQualifier(
  qual: EventDetail,
  mapping: Record<number, PositionRule>,
  split: QualSplit = 'random',
  seed = 0,
): DraftDivision[] {
  const groups = [...qual.leagues].sort((a, b) => a.tier - b.tier)
  type Placed = { player: Player; pos: number; group: number; pts: number; wins: number }
  const byPos = new Map<number, Placed[]>()
  groups.forEach((g, gi) => {
    const ranked = rankDivision(g.players, qual.matches, { multiSet: parseFormat(g.format).sets > 1, seed: hash(g.id) })
    ranked.forEach((r, idx) => {
      const pos = idx + 1
      const arr = byPos.get(pos) ?? []
      arr.push({ player: r.player, pos, group: gi, pts: r.pointDiff, wins: r.wins })
      byPos.set(pos, arr)
    })
  })

  const divPlayers = new Map<number, Player[]>()
  for (const pos of [...byPos.keys()].sort((a, b) => a - b)) {
    const rule = mapping[pos] ?? { div: pos, span: 1 }
    const startDiv = Math.max(1, rule.div)
    const span = Math.max(1, rule.span)
    let players = byPos.get(pos)!.slice()
    if (split === 'seed') players.sort((a, b) => b.player.elo - a.player.elo) // seed basis = rating (default seed list)
    else if (split === 'points') players.sort((a, b) => b.pts - a.pts || b.wins - a.wins)
    else players = players.map((p) => ({ p, k: hash(`${seed}:${pos}:${p.player.id}`) })).sort((a, b) => a.k - b.k).map((x) => x.p)
    const n = players.length
    players.forEach((pl, k) => {
      const chunk = span === 1 ? 0 : Math.min(span - 1, Math.floor((k * span) / n))
      const div = startDiv + chunk
      const arr = divPlayers.get(div) ?? []
      arr.push(pl.player)
      divPlayers.set(div, arr)
    })
  }

  const maxDiv = Math.max(0, ...divPlayers.keys())
  const out: DraftDivision[] = []
  for (let d = 1; d <= maxDiv; d++) {
    const members = divPlayers.get(d) ?? []
    if (!members.length) continue
    out.push({ name: LEAGUE_NAMES[d - 1] ?? `Division ${d}`, color: LEAGUE_COLORS[d - 1] ?? '#9aa4b2', players: members })
  }
  return out
}

/** Map each player to the division tier they were in for a season — used to draw
 *  promotion/relegation movement arrows between consecutive seasons. */
export function tierByPlayer(detail: EventDetail): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of detail.leagues) for (const p of l.players) m.set(p.id, l.tier)
  return m
}
