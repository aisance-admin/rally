import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { LeagueWithPlayers, Match, Player, SetScore } from '../types'
import type { Store } from '../lib/store'
import type { MatchOpResult } from '../lib/api'
import { roundRobin } from '../lib/planner'
import { explainPlacement, parseFormat, rankDivision, type RankedPlayer, type TieReason, type WL } from '../lib/seasons'
import { Avatar } from './bits'
import { Modal } from './Modal'

// ── helpers ──
function fixturesOf(players: Player[]): [Player, Player][] {
  const rounds = roundRobin(players.map((_, i) => i))
  const out: [Player, Player][] = []
  for (const round of rounds) for (const [i, j] of round) out.push([players[i], players[j]])
  return out
}
function findMatch(matches: Match[], aId: string, bId: string): Match | undefined {
  return matches.find((m) => (m.playerAId === aId && m.playerBId === bId) || (m.playerAId === bId && m.playerBId === aId))
}

type Mode = 'wl' | 'score' | 'rank'

export function GroupSheet({
  league, matches, readOnly, locked, store, eventId, index, total, prevRecords,
  onMatchOp, onValidate, onClose, onPrev, onNext,
}: {
  league: LeagueWithPlayers
  matches: Match[]
  readOnly: boolean
  locked: boolean
  store: Store
  eventId: string
  index: number
  total: number
  prevRecords?: Map<string, WL> | null
  onMatchOp: (res: MatchOpResult) => void
  onValidate: (on: boolean) => void
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
}) {
  const fmt = parseFormat(league.format)
  const multiSet = fmt.sets > 1
  const fx = useMemo(() => fixturesOf(league.players), [league.players])
  const groupMatches = useMemo(
    () => fx.map((f) => findMatch(matches, f[0].id, f[1].id)).filter(Boolean) as Match[],
    [fx, matches],
  )
  const editable = !readOnly && !locked

  const [mode, setMode] = useState<Mode>(() => {
    if (groupMatches.some((m) => m.status === 'rank')) return 'rank'
    if (groupMatches.length && groupMatches.every((m) => m.status === 'wl')) return 'wl'
    if (groupMatches.some((m) => m.status === 'final')) return 'score'
    return 'wl'
  })
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [pendingMode, setPendingMode] = useState<Mode | null>(null)
  const [explainId, setExplainId] = useState<string | null>(null)

  // Warn before switching to a less-detailed mode than the data already entered (spec §4).
  const levelOf = (s: Match['status']) => (s === 'final' ? 2 : s === 'wl' ? 1 : 0)
  const modeLevel = (md: Mode) => (md === 'score' ? 2 : md === 'wl' ? 1 : 0)
  const dataLevel = groupMatches.reduce((mx, m) => Math.max(mx, levelOf(m.status)), -1)
  const changeMode = (target: Mode) => {
    if (target !== mode && groupMatches.length && modeLevel(target) < dataLevel) setPendingMode(target)
    else setMode(target)
  }

  const standings = useMemo(
    () => rankDivision(league.players, matches, { multiSet, seed: hashId(league.id) }),
    [league.players, matches, multiSet, league.id],
  )
  const played = groupMatches.length
  const tiedNeedingPts = standings.filter((s) => s.reason === 'needs-pts').map((s) => s.player)
  const tiedNeedingDraw = standings.filter((s) => s.reason === 'draw-needed').map((s) => s.player)

  // Confirmed random draw (spec §2 step 4): shuffle the tied players, then write their
  // head-to-head as rank rows (round=1 = "decided by draw") so the order is stable and marked.
  const rankRandomly = async (tied: Player[]) => {
    if (busyKey || tied.length < 2) return
    setBusyKey('draw')
    try {
      const order = [...tied]
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
      for (let i = 0; i < order.length; i++)
        for (let j = i + 1; j < order.length; j++) {
          const a = order[i], b = order[j]
          const existing = findMatch(matches, a.id, b.id)
          const res = await store.recordMatch({ matchId: existing?.id, winnerId: a.id, loserId: b.id, winnerScore: 1, loserScore: 0, status: 'rank', round: 1, format: league.format, eventId, leagueId: league.id })
          onMatchOp(res)
        }
    } finally { setBusyKey(null) }
  }

  const rowRefs = useRef<Record<string, HTMLElement | null>>({})
  // After a save, bring the next unentered match into view (spec §3b).
  const advanceFrom = (key: string) => {
    const order = fx.map((f) => `${f[0].id}:${f[1].id}`)
    const start = order.indexOf(key)
    for (let i = start + 1; i < order.length; i++) {
      const [aId, bId] = order[i].split(':')
      if (!findMatch(matches, aId, bId)) { rowRefs.current[order[i]]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    }
  }

  const run = async (key: string, fn: () => Promise<MatchOpResult | void>, advance = false) => {
    if (busyKey) return
    setBusyKey(key)
    try {
      const res = await fn()
      if (res) onMatchOp(res)
      if (advance) advanceFrom(key)
    } finally {
      setBusyKey(null)
    }
  }

  // win/loss: tap the winner (records a 1–0 'wl' row, or flips an existing one)
  const pickWinner = (a: Player, b: Player, winnerId: string) => {
    const existing = findMatch(matches, a.id, b.id)
    if (existing && existing.winnerId === winnerId && existing.status === 'wl') return
    const loserId = winnerId === a.id ? b.id : a.id
    return run(`${a.id}:${b.id}`, () =>
      store.recordMatch({ matchId: existing?.id, winnerId, loserId, winnerScore: 1, loserScore: 0, status: 'wl', format: league.format, eventId, leagueId: league.id }),
      !existing, // advance to the next match only when entering a new one
    )
  }
  const clearResult = (a: Player, b: Player) => {
    const existing = findMatch(matches, a.id, b.id)
    if (!existing) return
    return run(`${a.id}:${b.id}`, () => store.deleteMatch(existing.id))
  }
  // scores: real points (or per-set for best-of-N)
  const saveScore = (a: Player, b: Player, winnerId: string, winnerScore: number, loserScore: number, sets: SetScore[] | null) => {
    const existing = findMatch(matches, a.id, b.id)
    const loserId = winnerId === a.id ? b.id : a.id
    return run(`${a.id}:${b.id}`, () =>
      store.recordMatch({ matchId: existing?.id, winnerId, loserId, winnerScore, loserScore, sets, status: 'final', format: league.format, eventId, leagueId: league.id }),
      !existing,
    )
  }

  return (
    <div className="space-y-4">
      {/* header + group nav */}
      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onClose} className="glass-soft tap shrink-0 rounded-xl px-3 py-2 text-xs font-semibold text-ink-300 hover:text-white">← Divisions</button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: league.color, boxShadow: `0 0 12px ${league.color}` }} />
              <span className="truncate text-lg font-extrabold">{league.name}</span>
              <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[11px] font-bold text-ink-300">{league.format}</span>
              {league.startScore > 0 && <span className="rounded-md bg-brand/15 px-1.5 py-0.5 text-[11px] font-bold text-brand-400" title="This group is handicapped — matches start from this score">start {league.startScore}–{league.startScore}</span>}
            </div>
            <div className="mt-1 text-xs text-ink-500">Group {index} of {total} · {played}/{fx.length} played</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!readOnly && (
            <button
              onClick={() => onValidate(!locked)}
              className={`tap rounded-xl px-3 py-2 text-xs font-bold ${locked ? 'bg-win/15 text-win ring-1 ring-win/30' : 'glass-soft text-ink-300 hover:text-white'}`}
              title={locked ? 'Group is locked — tap to reopen for edits' : 'Lock this group when results are final'}
            >
              {locked ? '✓ Validated' : 'Validate'}
            </button>
          )}
          <button onClick={onPrev} disabled={!onPrev} className="glass-soft tap grid h-9 w-9 place-items-center rounded-xl text-ink-300 hover:text-white disabled:opacity-30">‹</button>
          <button onClick={onNext} disabled={!onNext} className="glass-soft tap grid h-9 w-9 place-items-center rounded-xl text-ink-300 hover:text-white disabled:opacity-30">›</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* standings */}
        <div className="glass h-fit overflow-hidden rounded-3xl">
          <div className="px-4 py-3 text-sm font-bold" style={{ background: `linear-gradient(90deg, ${league.color}26, transparent)` }}>Standings</div>
          <div className="px-2 py-1">
            <div className="grid grid-cols-[20px_1fr_auto] gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
              <span></span><span>Player</span><span className="pr-1 text-right">W–L</span>
            </div>
            {standings.map((s, i) => (
              <motion.button layout transition={{ type: 'spring', stiffness: 500, damping: 40 }} key={s.player.id} onClick={() => setExplainId(s.player.id)} title="Why this rank?" className="tap grid w-full grid-cols-[20px_1fr_auto] items-center gap-1 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-white/5">
                <span className="text-center text-xs font-bold text-ink-500">{i + 1}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <Avatar name={s.player.name} size={20} />
                  <span className="flex items-center gap-1 truncate font-semibold">{s.player.name} <TieChip reason={s.reason} /></span>
                </span>
                <span className="pr-1 text-right font-mono text-xs"><span className="text-win">{s.wins}</span><span className="text-ink-600">–</span><span className="text-loss">{s.played - s.wins}</span></span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* entry */}
        <div className="space-y-3">
          {editable && (
            <div className="flex items-center justify-between gap-2">
              <ModeSeg value={mode} onChange={changeMode} />
              <span className="text-[11px] text-ink-500">
                {mode === 'wl' ? 'Tap the winner of each match' : mode === 'score' ? 'Enter exact scores' : 'Drag to rank — no scores'}
              </span>
            </div>
          )}

          {/* circular tie in Win/Loss mode: offer BOTH — enter scores, or draw (spec §4 + step 4) */}
          {tiedNeedingPts.length >= 2 && editable && (
            <div className="rounded-2xl bg-loss/10 p-3 ring-1 ring-loss/30">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-loss">
                <span>⚖️ {tiedNeedingPts.length} players finished level</span>
              </div>
              <p className="mb-2 text-[11px] text-ink-400">Equal wins and they beat each other in a circle. Enter the scores of just their matches to rank them — or rank them with a random draw.</p>
              <div className="space-y-2">
                {pairsWithin(tiedNeedingPts).map(([a, b]) => {
                  const m = findMatch(matches, a.id, b.id)
                  return (
                    <ScoreRow
                      key={`tie:${a.id}:${b.id}`}
                      a={a} b={b} match={m} multiSet={multiSet} pointsTo={fmt.pointsTo} startScore={league.startScore}
                      busy={busyKey === `${a.id}:${b.id}`} highlight
                      onSave={(winnerId, ws, ls, sets) => saveScore(a, b, winnerId, ws, ls, sets)}
                    />
                  )
                })}
              </div>
              <button onClick={() => rankRandomly(tiedNeedingPts)} disabled={!!busyKey} className="tap mt-2 w-full rounded-xl bg-white/10 py-2 text-xs font-bold text-ink-200 hover:bg-white/15 disabled:opacity-40">{busyKey === 'draw' ? 'Drawing…' : '🎲 Rank randomly instead'}</button>
            </div>
          )}

          {/* total equality (even with scores): explicit organizer-confirmed random draw (spec §2 step 4) */}
          {tiedNeedingDraw.length >= 2 && editable && (
            <div className="rounded-2xl bg-loss/10 p-3 ring-1 ring-loss/30">
              <div className="mb-1 flex items-center gap-2 text-sm font-bold text-loss"><span>🎲 Total equality</span></div>
              <p className="mb-2 text-[11px] text-ink-400">
                Everything is identical for <span className="font-semibold text-ink-200">{tiedNeedingDraw.map((p) => p.name).join(', ')}</span> — wins, head-to-head, and point difference. The only fair call is a random draw.
              </p>
              <button onClick={() => rankRandomly(tiedNeedingDraw)} disabled={!!busyKey} className="tap w-full rounded-xl bg-gradient-to-br from-brand to-brand2 py-2.5 text-xs font-bold text-white glow-brand disabled:opacity-40">{busyKey === 'draw' ? 'Drawing…' : 'Rank randomly?'}</button>
            </div>
          )}

          {/* fixtures by mode */}
          {mode === 'rank' ? (
            <RankEditor
              players={league.players} standings={standings} editable={editable}
              busy={!!busyKey}
              onApply={async (order) => {
                if (busyKey) return
                setBusyKey('rank')
                try {
                  for (let i = 0; i < order.length; i++)
                    for (let j = i + 1; j < order.length; j++) {
                      const a = order[i], b = order[j]
                      const existing = findMatch(matches, a.id, b.id)
                      const res = await store.recordMatch({ matchId: existing?.id, winnerId: a.id, loserId: b.id, winnerScore: 1, loserScore: 0, status: 'rank', format: league.format, eventId, leagueId: league.id })
                      onMatchOp(res)
                    }
                } finally { setBusyKey(null) }
              }}
            />
          ) : (
            <div className="glass overflow-hidden rounded-3xl">
              <div className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Matches</div>
              <div className="space-y-1.5 px-2 pb-2">
                {fx.map((f) => {
                  const [a, b] = f
                  const m = findMatch(matches, a.id, b.id)
                  const key = `${a.id}:${b.id}`
                  return (
                    <div key={key} ref={(el) => { rowRefs.current[key] = el }}>
                      {mode === 'wl' ? (
                        <WLRow
                          a={a} b={b} match={m} disabled={!editable} busy={busyKey === key}
                          onPick={(wid) => pickWinner(a, b, wid)} onClear={() => clearResult(a, b)}
                        />
                      ) : (
                        <ScoreRow
                          a={a} b={b} match={m} multiSet={multiSet} pointsTo={fmt.pointsTo} startScore={league.startScore}
                          disabled={!editable} busy={busyKey === key}
                          onSave={(winnerId, ws, ls, sets) => saveScore(a, b, winnerId, ws, ls, sets)}
                          onClear={m && editable ? () => clearResult(a, b) : undefined}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {locked && <div className="rounded-2xl bg-win/10 px-4 py-2.5 text-xs font-medium text-win ring-1 ring-win/25">Group validated and locked. Tap “✓ Validated” above to reopen for edits.</div>}
          {readOnly && <div className="rounded-2xl bg-white/5 px-4 py-2.5 text-xs text-ink-500">This season is finished — results are read-only.</div>}
        </div>
      </div>

      {pendingMode && (
        <Modal onClose={() => setPendingMode(null)}>
          <div className="px-5 py-5">
            <h3 className="text-lg font-bold">Switch to {pendingMode === 'wl' ? 'Win / Loss' : 'Direct ranking'}?</h3>
            <p className="mt-1 text-sm text-ink-500">
              {pendingMode === 'rank'
                ? 'Applying an order in Direct ranking replaces the match results already entered in this group.'
                : 'Win/Loss records 1–0 only. Existing exact scores stay, but re-entering a match here drops its score.'}
            </p>
          </div>
          <div className="flex gap-2 border-t hairline px-5 py-4">
            <button onClick={() => setPendingMode(null)} className="glass-soft tap flex-1 rounded-xl py-2.5 text-sm font-semibold text-ink-300">Keep current mode</button>
            <button onClick={() => { setMode(pendingMode); setPendingMode(null) }} className="tap flex-1 rounded-xl bg-gradient-to-br from-brand to-brand2 py-2.5 text-sm font-bold text-white glow-brand">Switch anyway</button>
          </div>
        </Modal>
      )}

      {explainId && (
        <Modal onClose={() => setExplainId(null)}>
          <div className="px-5 py-5">
            <div className="mb-2 flex items-center gap-2">
              <Avatar name={standings.find((s) => s.player.id === explainId)?.player.name ?? ''} size={32} />
              <h3 className="text-lg font-bold">{standings.find((s) => s.player.id === explainId)?.player.name}</h3>
            </div>
            <p className="text-sm leading-relaxed text-ink-300">{explainPlacement(explainId, standings, matches)}</p>
          </div>
          <div className="border-t hairline px-5 py-4">
            <button onClick={() => setExplainId(null)} className="glass-soft tap w-full rounded-xl py-2.5 text-sm font-semibold text-ink-300">Got it</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── win/loss row: two big tap targets ──
function WLRow({ a, b, match, disabled, busy, onPick, onClear }: {
  a: Player; b: Player; match?: Match; disabled: boolean; busy: boolean; onPick: (winnerId: string) => void; onClear: () => void
}) {
  const aWon = match?.winnerId === a.id
  const bWon = match?.winnerId === b.id
  const side = (won: boolean) =>
    `tap min-w-0 flex-1 truncate rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
      won ? 'bg-win/20 text-win ring-1 ring-win/40' : match ? 'bg-white/[0.03] text-ink-500' : 'bg-white/[0.06] text-ink-200 hover:bg-white/10'
    }`
  return (
    <div className={`flex items-center gap-1.5 ${busy ? 'opacity-50' : ''}`}>
      <button disabled={disabled || busy} onClick={() => onPick(a.id)} className={`${side(aWon)} text-right`}>{a.name}</button>
      <span className="shrink-0 text-[10px] font-bold text-ink-600">v</span>
      <button disabled={disabled || busy} onClick={() => onPick(b.id)} className={side(bWon)}>{b.name}</button>
      <button onClick={onClear} disabled={!match || disabled || busy} title="Clear result" className="tap shrink-0 grid h-7 w-7 place-items-center rounded-lg text-ink-600 hover:text-loss disabled:opacity-0">✕</button>
    </div>
  )
}

// ── score row: collapsed summary → expand to steppers ──
function ScoreRow({ a, b, match, multiSet, pointsTo, startScore = 0, disabled, busy, highlight, onSave, onClear }: {
  a: Player; b: Player; match?: Match; multiSet: boolean; pointsTo: number; startScore?: number; disabled?: boolean; busy?: boolean; highlight?: boolean
  onSave: (winnerId: string, winnerScore: number, loserScore: number, sets: SetScore[] | null) => void
  onClear?: () => void
}) {
  const [open, setOpen] = useState(false)
  const aScore = match ? (match.playerAId === a.id ? match.scoreA : match.scoreB) : 0
  const bScore = match ? (match.playerAId === a.id ? match.scoreB : match.scoreA) : 0
  const aWon = match?.winnerId === a.id

  if (match && !open) {
    return (
      <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${highlight ? 'bg-white/[0.07]' : 'bg-white/[0.04]'}`}>
        <span className={`flex-1 truncate text-right ${aWon ? 'font-bold' : 'text-ink-500'}`}>{a.name}</span>
        <span className="font-mono font-bold">{aScore}</span><span className="text-ink-600">:</span><span className="font-mono font-bold">{bScore}</span>
        <span className={`flex-1 truncate ${!aWon ? 'font-bold' : 'text-ink-500'}`}>{b.name}</span>
        {!disabled && <button onClick={() => setOpen(true)} className="tap text-[11px] font-semibold text-brand-400">edit</button>}
        {onClear && <button onClick={onClear} title="Delete result" className="tap text-ink-600 hover:text-loss">✕</button>}
      </div>
    )
  }
  if (!match && !open) {
    return (
      <button onClick={() => !disabled && setOpen(true)} disabled={disabled} className="tap flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-60">
        <span className="flex-1 truncate text-right">{a.name}</span>
        <span className="rounded-md bg-white/8 px-2 py-0.5 text-[11px] font-semibold text-ink-300">vs</span>
        <span className="flex-1 truncate">{b.name}</span>
        <span className="text-[11px] font-semibold text-brand-400">enter</span>
      </button>
    )
  }
  return (
    <ScoreEditor
      a={a} b={b} multiSet={multiSet} pointsTo={pointsTo} startScore={startScore} busy={!!busy}
      initialA={aScore} initialB={bScore} initialSets={match?.sets ?? null}
      onCancel={() => setOpen(false)}
      onSave={(wid, ws, ls, sets) => { onSave(wid, ws, ls, sets); setOpen(false) }}
    />
  )
}

function ScoreEditor({ a, b, multiSet, pointsTo, startScore = 0, busy, initialA, initialB, initialSets, onSave, onCancel }: {
  a: Player; b: Player; multiSet: boolean; pointsTo: number; startScore?: number; busy: boolean
  initialA: number; initialB: number; initialSets: SetScore[] | null
  onSave: (winnerId: string, winnerScore: number, loserScore: number, sets: SetScore[] | null) => void
  onCancel: () => void
}) {
  const maxSets = multiSet ? Math.max(3, (initialSets?.length ?? 0)) : 1
  const [sets, setSets] = useState<SetScore[]>(() => {
    if (multiSet) {
      const base = initialSets && initialSets.length ? initialSets : []
      return Array.from({ length: maxSets }, (_, i) => base[i] ?? { a: 0, b: 0 })
    }
    // Fresh single-set match opens at the group's handicap base (spec §1); else 11:0 convenience.
    return [{ a: initialA || (startScore || pointsTo), b: initialB || startScore }]
  })
  const setVal = (i: number, side: 'a' | 'b', v: number) =>
    setSets((s) => s.map((st, j) => (j === i ? { ...st, [side]: Math.max(0, v) } : st)))

  let winnerId = '', ws = 0, ls = 0, payload: SetScore[] | null = null, ok = false
  if (multiSet) {
    const used = sets.filter((s) => s.a || s.b)
    const aw = used.filter((s) => s.a > s.b).length
    const bw = used.filter((s) => s.b > s.a).length
    ok = used.length > 0 && aw !== bw
    winnerId = aw > bw ? a.id : b.id
    ws = Math.max(aw, bw); ls = Math.min(aw, bw)
    payload = used.length ? used : null
  } else {
    const s = sets[0]
    ok = s.a !== s.b
    winnerId = s.a > s.b ? a.id : b.id
    ws = Math.max(s.a, s.b); ls = Math.min(s.a, s.b)
    payload = null
  }

  return (
    <div className="animate-pop rounded-2xl bg-white/[0.05] p-3 ring-1 ring-brand/30">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm font-semibold">
        <div className="truncate text-right">{a.name}</div>
        <div className="text-[11px] text-ink-500">{multiSet ? 'sets' : `to ${pointsTo}`}</div>
        <div className="truncate">{b.name}</div>
      </div>
      <div className="mt-2 space-y-1.5">
        {sets.map((st, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <Stepper value={st.a} onChange={(v) => setVal(i, 'a', v)} />
            <span className="text-ink-600">:</span>
            <Stepper value={st.b} onChange={(v) => setVal(i, 'b', v)} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={onCancel} className="glass-soft tap flex-1 rounded-xl py-2 text-xs font-semibold text-ink-300">Cancel</button>
        <button onClick={() => ok && onSave(winnerId, ws, ls, payload)} disabled={busy || !ok} className="tap flex-1 rounded-xl bg-gradient-to-br from-brand to-brand2 py-2 text-xs font-bold text-white glow-brand disabled:opacity-40 disabled:shadow-none">
          {busy ? 'Saving…' : ok ? 'Save result' : 'Needs a winner'}
        </button>
      </div>
    </div>
  )
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <button onClick={() => onChange(Math.max(0, value - 1))} className="tap grid h-8 w-8 place-items-center rounded-xl bg-white/8 text-lg font-bold text-ink-400 hover:text-white">−</button>
      <span className="w-8 text-center font-mono text-xl font-extrabold tabular-nums">{value}</span>
      <button onClick={() => onChange(value + 1)} className="tap grid h-8 w-8 place-items-center rounded-xl bg-white/8 text-lg font-bold text-ink-400 hover:text-white">+</button>
    </div>
  )
}

// ── direct ranking: order the players, synthesize 'rank' rows (no ELO) ──
function RankEditor({ players, standings, editable, busy, onApply }: {
  players: Player[]; standings: RankedPlayer[]; editable: boolean; busy: boolean; onApply: (order: Player[]) => void
}) {
  const [order, setOrder] = useState<Player[]>(() => standings.map((s) => s.player))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= order.length) return
    setOrder((o) => { const n = [...o]; ;[n[i], n[j]] = [n[j], n[i]]; return n })
  }
  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Rank the group (1 = top) · resulting W–L shown</div>
      <div className="divide-hair">
        {order.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2 px-3 py-2">
            <span className="w-5 text-center text-xs font-bold text-ink-500">{i + 1}</span>
            <Avatar name={p.name} size={24} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
            <span className="font-mono text-[11px] font-semibold" title="Win–loss this order produces"><span className="text-win">{order.length - 1 - i}</span><span className="text-ink-600">–</span><span className="text-loss">{i}</span></span>
            <div className="flex items-center gap-0.5">
              <button disabled={!editable || i === 0} onClick={() => move(i, -1)} className="tap grid h-7 w-7 place-items-center rounded-lg text-ink-400 hover:bg-white/10 hover:text-white disabled:opacity-20">▲</button>
              <button disabled={!editable || i === order.length - 1} onClick={() => move(i, 1)} className="tap grid h-7 w-7 place-items-center rounded-lg text-ink-400 hover:bg-white/10 hover:text-white disabled:opacity-20">▼</button>
            </div>
          </div>
        ))}
      </div>
      {editable && (
        <div className="border-t hairline p-2">
          <button onClick={() => onApply(order)} disabled={busy} className="tap w-full rounded-xl bg-gradient-to-br from-brand to-brand2 py-2.5 text-xs font-bold text-white glow-brand disabled:opacity-40">
            {busy ? 'Applying…' : 'Apply ranking'}
          </button>
          <p className="mt-1.5 px-1 text-center text-[10px] text-ink-500">Records head-to-head results from this order. Ratings are not affected.</p>
        </div>
      )}
    </div>
  )
}

function ModeSeg({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const opts: [Mode, string][] = [['wl', 'Win / Loss'], ['score', 'Scores'], ['rank', 'Ranking']]
  return (
    <div className="glass-soft flex items-center gap-0.5 rounded-xl p-0.5">
      {opts.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={`tap rounded-lg px-3 py-1.5 text-xs font-bold transition ${value === v ? 'bg-white/12 text-white' : 'text-ink-500 hover:text-ink-300'}`}>{label}</button>
      ))}
    </div>
  )
}

const TIE_CHIP: Record<string, { t: string; c: string }> = {
  H2H: { t: 'H2H', c: '#5aa9ff' },
  'mini-wins': { t: 'H2H', c: '#5aa9ff' },
  'mini-pts': { t: 'pts', c: '#f0a93b' },
  'mini-sets': { t: 'sets', c: '#f0a93b' },
  'total-pts': { t: 'pts', c: '#f0a93b' },
  'total-sets': { t: 'sets', c: '#f0a93b' },
  'needs-pts': { t: 'tie', c: '#fb6f7d' },
  'draw-needed': { t: 'tie', c: '#fb6f7d' },
  draw: { t: 'draw', c: '#9aa4b2' },
}
export function TieChip({ reason }: { reason: TieReason }) {
  if (!reason) return null
  const c = TIE_CHIP[reason]
  if (!c) return null
  return (
    <span className="rounded px-1 py-px text-[9px] font-bold uppercase" style={{ background: `${c.c}22`, color: c.c }} title={`Tie-break: ${reason}`}>{c.t}</span>
  )
}

// pairs among a set of players (for the tie-break prompt)
function pairsWithin(players: Player[]): [Player, Player][] {
  const out: [Player, Player][] = []
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) out.push([players[i], players[j]])
  return out
}

function hashId(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
