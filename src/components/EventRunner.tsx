import { useEffect, useMemo, useState } from 'react'
import type { EventDetail, LeagueWithPlayers, Match, Player } from '../types'
import type { Store } from '../lib/store'
import { manualSizes, roundRobin } from '../lib/planner'
import {
  createEventWithLeagues,
  createQualifierEvent,
  deleteEvent,
  fetchEventDetail,
  finishEvent,
  promoteQualifierToLeagues,
} from '../lib/events'
import { Avatar } from './bits'
import { SkillBadge } from './SkillBadge'
import { Modal } from './Modal'
import { SeasonDraft } from './SeasonDraft'
import { groupSeries, seasonRecordsFor, type WL } from '../lib/seasons'

const LEAGUE_NAMES = ['Elite', 'Division 1', 'Division 2', 'Division 3', 'Division 4', 'Division 5', 'Division 6']
const LEAGUE_COLORS = ['#ff2d55', '#ff6321', '#f0a93b', '#5ec26a', '#9aa4b2', '#6ea8ff', '#b06eff']

export function EventRunner({ store, onSelect }: { store: Store; onSelect: (id: string) => void }) {
  const liveEvent = store.events.find((e) => e.status === 'live' || e.status === 'qualifying')
  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [view, setView] = useState<'hub' | 'setup' | 'draft'>('hub')
  const [draftPrev, setDraftPrev] = useState<EventDetail | null>(null)
  const [prevRecords, setPrevRecords] = useState<Map<string, WL> | null>(null)

  const refreshDetail = async (id: string) => {
    setLoadingDetail(true)
    try {
      setDetail(await fetchEventDetail(id))
    } finally {
      setLoadingDetail(false)
    }
  }

  useEffect(() => {
    if (liveEvent) refreshDetail(liveEvent.id)
    else setDetail(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEvent?.id])

  // Load the previous season's W/L so the live season can show "last season" records.
  useEffect(() => {
    let cancelled = false
    async function loadPrev() {
      if (!detail || detail.event.season <= 1 || detail.event.status === 'qualifying') {
        setPrevRecords(null)
        return
      }
      const prev = store.events.find(
        (e) => e.name === detail.event.name && e.season === detail.event.season - 1,
      )
      if (!prev) {
        setPrevRecords(null)
        return
      }
      const pd = await fetchEventDetail(prev.id)
      if (!cancelled) setPrevRecords(seasonRecordsFor(pd))
    }
    loadPrev()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.event.id])

  if (liveEvent && detail) {
    if (detail.event.status === 'qualifying') {
      return (
        <QualifierView
          store={store}
          detail={detail}
          loading={loadingDetail}
          onChanged={() => refreshDetail(liveEvent.id)}
        />
      )
    }
    return (
      <LiveEvent
        store={store}
        detail={detail}
        loading={loadingDetail}
        prevRecords={prevRecords}
        onSelect={onSelect}
        onChanged={() => refreshDetail(liveEvent.id)}
      />
    )
  }

  if (view === 'draft' && draftPrev) {
    return (
      <SeasonDraft
        store={store}
        prev={draftPrev}
        onStarted={(id) => { setView('hub'); refreshDetail(id) }}
        onCancel={() => setView('hub')}
      />
    )
  }

  if (view === 'setup') {
    return (
      <Setup
        store={store}
        onStarted={(id) => { setView('hub'); refreshDetail(id) }}
        onCancel={store.events.length ? () => setView('hub') : undefined}
      />
    )
  }

  return (
    <SeasonHub
      store={store}
      onNewSeries={() => setView('setup')}
      onStartNext={async (prevId) => { setDraftPrev(await fetchEventDetail(prevId)); setView('draft') }}
    />
  )
}

// ───────────────────────── season hub ─────────────────────────

function SeasonHub({
  store,
  onNewSeries,
  onStartNext,
}: {
  store: Store
  onNewSeries: () => void
  onStartNext: (prevEventId: string) => void
}) {
  const series = groupSeries(store.events)

  if (store.players.length === 0) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-ink-600 py-16 text-center">
        <div className="text-4xl">📅</div>
        <div className="mt-3 text-lg font-semibold">No roster yet</div>
        <div className="mt-1 max-w-sm text-sm text-ink-500">
          Add players in the <span className="font-semibold text-brand">Roster</span> tab (or load the sample roster) before starting a league.
        </div>
      </div>
    )
  }

  if (series.length === 0) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-ink-600 py-16 text-center">
        <div className="text-4xl">🏆</div>
        <div className="mt-3 text-lg font-semibold">No leagues yet</div>
        <div className="mt-1 max-w-sm text-sm text-ink-500">Start a league and play seasons — each new season re-seeds players by the previous results.</div>
        <button onClick={onNewSeries} className="mt-4 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-ink-900">＋ Start a league</button>
      </div>
    )
  }

  return (
    <div className="animate-fade space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500">Leagues & seasons</h2>
        <button onClick={onNewSeries} className="rounded-lg bg-ink-800 px-3 py-2 text-xs font-semibold text-ink-300 ring-1 ring-ink-700 hover:text-white">＋ New league</button>
      </div>

      {series.map((s) => {
        const latest = s.seasons[s.seasons.length - 1]
        const canStartNext = latest.status === 'done'
        return (
          <div key={s.name} className="overflow-hidden rounded-xl bg-ink-850 ring-1 ring-ink-700">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <div className="font-bold">{s.name}</div>
                <div className="text-xs text-ink-500">{s.seasons.length} season{s.seasons.length === 1 ? '' : 's'}</div>
              </div>
              {canStartNext && (
                <button onClick={() => onStartNext(latest.id)} className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-ink-900 hover:bg-brand-400">
                  ⚡ Start Season {latest.season + 1}
                </button>
              )}
            </div>
            <div className="divide-y divide-ink-800 border-t border-ink-800">
              {[...s.seasons].reverse().map((ev) => (
                <div key={ev.id} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink-800 font-mono text-xs font-bold text-ink-300">S{ev.season}</span>
                  <span className="flex-1 text-sm font-semibold">Season {ev.season}</span>
                  <span className="text-xs text-ink-500">{ev.participantIds.length} players · {ev.tables} divisions</span>
                  <StatusPill status={ev.status} />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { c: string; t: string }> = {
    done: { c: '#9aa4b2', t: 'Done' },
    live: { c: '#32d74b', t: 'Live' },
    qualifying: { c: '#ff7a33', t: 'Qualifier' },
    draft: { c: '#6ea8ff', t: 'Draft' },
  }
  const s = map[status] ?? map.draft
  return (
    <span className="rounded px-1.5 py-0.5 text-[11px] font-bold uppercase" style={{ background: `${s.c}22`, color: s.c }}>
      {s.t}
    </span>
  )
}

// ───────────────────────── qualification round ─────────────────────────

/** Deterministic random pairing seeded by event id (stable across refreshes). */
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function qualifierPairings(players: Player[], seed: string): { pairs: [Player, Player][]; bye: Player | null } {
  const arr = [...players]
    .map((p) => ({ p, k: hashStr(`${seed}:${p.id}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.p)
  const pairs: [Player, Player][] = []
  for (let i = 0; i + 1 < arr.length; i += 2) pairs.push([arr[i], arr[i + 1]])
  const bye = arr.length % 2 ? arr[arr.length - 1] : null
  return { pairs, bye }
}

function QualifierView({
  store,
  detail,
  loading,
  onChanged,
}: {
  store: Store
  detail: EventDetail
  loading: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const pool = detail.leagues[0]
  const players = pool?.players ?? []
  const [numLeagues, setNumLeagues] = useState(() =>
    Math.max(1, Math.min(detail.event.tables || 4, Math.max(1, players.length))),
  )
  const leagues = Math.min(Math.max(1, numLeagues), Math.max(1, players.length))
  const sizes = manualSizes(players.length, leagues)
  const { pairs, bye } = qualifierPairings(players, detail.event.id)
  const played = pairs.filter((f) => findMatch(detail.matches, f[0].id, f[1].id)).length
  const allDone = played === pairs.length

  async function build() {
    setBusy(true)
    try {
      await promoteQualifierToLeagues(detail.event.id, leagues)
      await store.refresh()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="animate-fade space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-850 p-4 ring-1 ring-ink-700">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold">{detail.event.name}</span>
            <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[11px] font-bold uppercase text-brand-400">Qualifier</span>
          </div>
          <div className="mt-0.5 text-xs text-ink-500">
            Random pairings · {played}/{pairs.length} played · → {leagues} leagues ({sizes.join('·') || '—'})
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-ink-800 px-2 py-1.5 ring-1 ring-ink-700">
            <span className="text-[11px] uppercase tracking-wide text-ink-500">Leagues</span>
            <button onClick={() => setNumLeagues(Math.max(1, leagues - 1))} className="grid h-6 w-6 place-items-center rounded bg-ink-900 font-bold text-ink-400 hover:text-white">−</button>
            <span className="w-5 text-center font-mono font-bold">{leagues}</span>
            <button onClick={() => setNumLeagues(Math.min(Math.max(1, players.length), leagues + 1))} className="grid h-6 w-6 place-items-center rounded bg-ink-900 font-bold text-ink-400 hover:text-white">+</button>
          </div>
          <button
            onClick={async () => { await deleteEvent(detail.event.id); await store.refresh() }}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-ink-500 ring-1 ring-ink-700 hover:text-loss"
          >
            Discard
          </button>
          <button
            onClick={build}
            disabled={busy}
            title={allDone ? '' : 'Some qualifier matches are still open — leagues use current ratings'}
            className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-ink-900 hover:bg-brand-400 disabled:opacity-40"
          >
            {busy ? 'Building…' : `⚡ Build ${leagues} leagues`}
          </button>
        </div>
      </div>

      {!allDone && (
        <div className="rounded-lg bg-ink-800 px-3 py-2 text-xs text-ink-400">
          Play all pairings to fully calibrate, or build leagues now — players are ranked by their
          current ELO (updated live as results come in).
        </div>
      )}

      <div className="overflow-hidden rounded-xl bg-ink-850 ring-1 ring-ink-700">
        <div className="flex items-center justify-between px-4 py-3" style={{ background: 'linear-gradient(90deg, #ff550022, transparent)' }}>
          <span className="font-bold">Qualification round</span>
          <span className="text-xs text-ink-500">{players.length} players</span>
        </div>
        <div className="px-2 py-2">
          <div className="space-y-1">
            {pairs.map((f) => {
              const m = findMatch(detail.matches, f[0].id, f[1].id)
              const key = `${f[0].id}:${f[1].id}`
              return (
                <QualifierRow key={key} a={f[0]} b={f[1]} match={m} eventId={detail.event.id} leagueId={pool!.id} store={store} onDone={onChanged} />
              )
            })}
            {bye && (
              <div className="flex items-center gap-2 rounded-lg bg-ink-800/40 px-3 py-2 text-sm text-ink-500">
                <span className="flex-1">{bye.name}</span>
                <span className="rounded bg-ink-700 px-2 py-0.5 text-[11px] font-semibold">bye</span>
              </div>
            )}
          </div>
        </div>
      </div>
      {loading && <div className="text-center text-xs text-ink-500">syncing…</div>}
    </div>
  )
}

function QualifierRow({
  a,
  b,
  match,
  eventId,
  leagueId,
  store,
  onDone,
}: {
  a: Player
  b: Player
  match?: Match
  eventId: string
  leagueId: string
  store: Store
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <FixtureRow
      a={a}
      b={b}
      match={match}
      open={open}
      onToggle={() => setOpen((v) => !v)}
      format="1 set to 11"
      leagueId={leagueId}
      eventId={eventId}
      store={store}
      onDone={() => { setOpen(false); onDone() }}
    />
  )
}

// ───────────────────────── setup / generation ─────────────────────────

function Setup({ store, onStarted, onCancel }: { store: Store; onStarted: (id: string) => void; onCancel?: () => void }) {
  const [name, setName] = useState('League Night')
  const [method, setMethod] = useState<'elo' | 'qualifier'>('elo')
  // Track who is OUT (default: everyone checked in; roster changes auto-include).
  const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set())
  const [numLeagues, setNumLeagues] = useState(4)
  const [busy, setBusy] = useState(false)

  const roster = useMemo(() => [...store.players].sort((a, b) => b.elo - a.elo), [store.players])
  const isIn = (id: string) => !unchecked.has(id)
  const count = roster.filter((p) => isIn(p.id)).length

  const maxLeagues = Math.max(1, count)
  const leagues = Math.min(Math.max(1, numLeagues), maxLeagues)
  const sizes = manualSizes(count, leagues)
  const perLeague = leagues > 0 ? Math.round(count / leagues) : 0
  const minSize = sizes.length ? Math.min(...sizes) : 0
  const setPerLeague = (per: number) => {
    if (per > 0 && count > 0) setNumLeagues(Math.max(1, Math.min(count, Math.round(count / per))))
  }

  const toggle = (id: string) =>
    setUnchecked((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  async function start() {
    if (count < 2) return
    setBusy(true)
    try {
      const players = store.players.filter((p) => isIn(p.id))
      // `tables` = league count, `durationMin` = season number (this is Season 1).
      const config = { name: name.trim() || 'League Night', tables: leagues, durationMin: 1, setMinutes: 8, withQualifier: method === 'qualifier' }
      const id =
        method === 'qualifier'
          ? await createQualifierEvent(config, players)
          : await createEventWithLeagues(config, players, leagues)
      await store.refresh()
      onStarted(id)
    } finally {
      setBusy(false)
    }
  }

  if (store.players.length === 0) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-ink-600 py-16 text-center">
        <div className="text-4xl">📅</div>
        <div className="mt-3 text-lg font-semibold">No roster yet</div>
        <div className="mt-1 max-w-sm text-sm text-ink-500">
          Add players in the <span className="font-semibold text-brand">Roster</span> tab (or load the
          sample roster) before generating leagues.
        </div>
      </div>
    )
  }

  return (
    <div className="grid animate-fade gap-5 lg:grid-cols-[380px_1fr]">
      {/* config + check-in */}
      <div className="space-y-4">
        <div className="space-y-3 rounded-xl bg-ink-850 p-5 ring-1 ring-ink-700">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500">New league · Season 1</h2>
            {onCancel && <button onClick={onCancel} className="text-xs font-semibold text-ink-500 hover:text-white">← back</button>}
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm font-semibold outline-none ring-1 ring-ink-700" placeholder="League name (e.g. Thursday Night)" />
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-500">How to split players into leagues</div>
            <div className="grid grid-cols-2 gap-2">
              <MethodCard
                active={method === 'elo'}
                onClick={() => setMethod('elo')}
                title="By ELO rank"
                desc="Seed leagues from current ratings. Best for returning players."
                icon="📊"
              />
              <MethodCard
                active={method === 'qualifier'}
                onClick={() => setMethod('qualifier')}
                title="Random + qualifier"
                desc="Random round first, then split by result. Best for unknown levels."
                icon="🎲"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl bg-ink-850 p-5 ring-1 ring-ink-700">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500">League structure</h2>
          <div className="grid grid-cols-2 gap-3">
            <NumControl label="Number of leagues" value={leagues} min={1} max={maxLeagues} onChange={setNumLeagues} />
            <NumControl label="Players / league" value={perLeague} min={1} max={Math.max(1, count)} onChange={setPerLeague} />
          </div>
          <p className="text-[11px] text-ink-500">
            {count} checked in → sizes <span className="font-mono text-ink-300">{sizes.join(' · ') || '—'}</span>
          </p>
          {minSize < 2 && count >= 2 && (
            <p className="rounded-lg bg-brand/10 px-2.5 py-1.5 text-[11px] text-brand-400">⚠ Some leagues would have fewer than 2 players — lower the league count.</p>
          )}
        </div>

        <div className="overflow-hidden rounded-xl bg-ink-850 ring-1 ring-ink-700">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-bold">Check-in <span className="text-ink-500">· {count}/{roster.length}</span></span>
            <div className="flex gap-1.5">
              <button onClick={() => setUnchecked(new Set())} className="rounded-md bg-ink-700 px-2 py-1 text-[11px] font-semibold">All</button>
              <button onClick={() => setUnchecked(new Set(roster.map((p) => p.id)))} className="rounded-md bg-ink-700 px-2 py-1 text-[11px] font-semibold">None</button>
            </div>
          </div>
          <div className="max-h-[320px] divide-y divide-ink-800 overflow-y-auto">
            {roster.map((p) => {
              const on = isIn(p.id)
              return (
                <button key={p.id} onClick={() => toggle(p.id)} className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-ink-800">
                  <span className="grid h-5 w-5 place-items-center rounded text-xs" style={{ background: on ? '#32d74b' : '#2a3340', color: on ? '#0b0d11' : 'transparent' }}>✓</span>
                  <SkillBadge elo={p.elo} size="sm" />
                  <span className="flex-1 truncate text-sm font-semibold" style={{ opacity: on ? 1 : 0.5 }}>{p.name}</span>
                  <span className="font-mono text-xs text-ink-500">{p.elo}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* preview + start */}
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Players" value={String(count)} />
          <Kpi label="Leagues" value={String(leagues)} />
          <Kpi label="Players / league" value={String(perLeague)} />
        </div>

        {method === 'qualifier' && (
          <div className="rounded-lg bg-brand/10 px-3 py-2 text-xs text-brand-400 ring-1 ring-brand/30">
            🎲 A random qualifier round runs first. You confirm the {leagues} leagues afterwards, split by result.
          </div>
        )}

        <div className="overflow-hidden rounded-xl ring-1 ring-ink-700">
          <div className="grid grid-cols-[1fr_90px] gap-2 bg-ink-850 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            <span>{method === 'qualifier' ? 'League (after qualifier)' : 'League'}</span>
            <span className="text-right">Players</span>
          </div>
          <div className="divide-y divide-ink-800">
            {sizes.map((sz, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px] items-center gap-2 px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2 font-semibold">
                  <span className="h-2 w-2 rounded-full" style={{ background: LEAGUE_COLORS[i] ?? '#9aa4b2' }} />
                  {LEAGUE_NAMES[i] ?? `League ${i + 1}`}
                </span>
                <span className="text-right font-mono">{sz}</span>
              </div>
            ))}
            {sizes.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-ink-500">Check in players to preview leagues.</div>
            )}
          </div>
        </div>

        <button
          onClick={start}
          disabled={busy || count < 2}
          className="w-full rounded-xl bg-brand py-3.5 text-base font-extrabold text-ink-900 shadow-glow transition hover:bg-brand-400 disabled:opacity-40"
        >
          {busy
            ? 'Starting…'
            : count < 2
            ? 'Check in at least 2 players'
            : method === 'qualifier'
            ? `🎲 Start qualifier · ${count} players`
            : `⚡ Generate ${leagues} leagues & start`}
        </button>
      </div>
    </div>
  )
}

// ───────────────────────── live event ─────────────────────────

function LiveEvent({
  store,
  detail,
  loading,
  prevRecords,
  onSelect,
  onChanged,
}: {
  store: Store
  detail: EventDetail
  loading: boolean
  prevRecords?: Map<string, WL> | null
  onSelect: (id: string) => void
  onChanged: () => void
}) {
  const [confirmFinish, setConfirmFinish] = useState(false)
  const totalFixtures = detail.leagues.reduce((s, l) => s + fixtures(l).length, 0)
  const playedFixtures = detail.leagues.reduce(
    (s, l) => s + fixtures(l).filter((f) => findMatch(detail.matches, f[0].id, f[1].id)).length,
    0,
  )

  return (
    <div className="animate-fade space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-850 p-4 ring-1 ring-ink-700">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-win" />
            <span className="font-extrabold">{detail.event.name}</span>
            <span className="rounded bg-ink-700 px-1.5 py-0.5 text-[11px] font-bold uppercase text-ink-300">Season {detail.event.season}</span>
            <span className="rounded bg-win/15 px-1.5 py-0.5 text-[11px] font-bold uppercase text-win">Live</span>
          </div>
          <div className="mt-0.5 text-xs text-ink-500">
            {detail.event.participantIds.length} players · {detail.leagues.length} leagues · {playedFixtures}/{totalFixtures} matches played
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => { await deleteEvent(detail.event.id); await store.refresh() }}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-ink-500 ring-1 ring-ink-700 hover:text-loss"
          >
            Discard
          </button>
          <button onClick={() => setConfirmFinish(true)} className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-ink-900 hover:bg-brand-400">
            ✓ Finish event
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {detail.leagues.map((l) => (
          <LeagueCard key={l.id} league={l} matches={detail.matches} prevRecords={prevRecords} store={store} onSelect={onSelect} onChanged={onChanged} />
        ))}
      </div>

      {loading && <div className="text-center text-xs text-ink-500">syncing…</div>}

      {confirmFinish && (
        <Modal onClose={() => setConfirmFinish(false)}>
          <div className="px-5 py-5">
            <h3 className="text-lg font-bold">Finish event?</h3>
            <p className="mt-1 text-sm text-ink-500">
              Ratings are already saved after each match — finishing just closes the event and moves
              it to history. Promotions/relegations stay reflected on the leaderboard.
            </p>
          </div>
          <div className="flex gap-2 border-t border-ink-800 px-5 py-4">
            <button onClick={() => setConfirmFinish(false)} className="flex-1 rounded-lg bg-ink-800 py-2.5 text-sm font-semibold text-ink-300">Keep open</button>
            <button onClick={async () => { await finishEvent(detail.event.id); await store.refresh(); setConfirmFinish(false) }} className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-bold text-ink-900">
              Finish & archive
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function LeagueCard({
  league,
  matches,
  prevRecords,
  store,
  onSelect,
  onChanged,
}: {
  league: LeagueWithPlayers
  matches: Match[]
  prevRecords?: Map<string, WL> | null
  store: Store
  onSelect: (id: string) => void
  onChanged: () => void
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const fx = fixtures(league)
  const played = fx.filter((f) => findMatch(matches, f[0].id, f[1].id)).length
  const standings = computeStandings(league, matches)

  return (
    <div className="overflow-hidden rounded-xl bg-ink-850 ring-1 ring-ink-700">
      <div className="flex items-center justify-between px-4 py-3" style={{ background: `linear-gradient(90deg, ${league.color}22, transparent)` }}>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: league.color }} />
          <span className="font-bold">{league.name}</span>
          <span className="text-[11px] text-ink-500">{league.format}</span>
        </div>
        <span className="text-xs font-semibold text-ink-500">{played}/{fx.length} played</span>
      </div>

      {/* standings */}
      <div className="px-2 py-1">
        <div className="grid grid-cols-[20px_1fr_28px_28px_36px] gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
          <span></span><span>Player</span><span className="text-center">P</span><span className="text-center">W</span><span className="text-right">+/-</span>
        </div>
        {standings.map((s, i) => (
          <button key={s.player.id} onClick={() => onSelect(s.player.id)} className="grid w-full grid-cols-[20px_1fr_28px_28px_36px] items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-ink-800">
            <span className="text-center text-xs font-bold text-ink-500">{i + 1}</span>
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={s.player.name} size={22} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate font-semibold">{s.player.name}</span>
                {prevRecords && (
                  <span className="block text-[10px] text-ink-500">
                    last: {prevRecords.has(s.player.id) ? `${prevRecords.get(s.player.id)!.wins}-${prevRecords.get(s.player.id)!.losses}` : 'new'}
                  </span>
                )}
              </span>
            </span>
            <span className="text-center font-mono text-xs text-ink-500">{s.played}</span>
            <span className="text-center font-mono text-xs text-win">{s.wins}</span>
            <span className="text-right font-mono text-xs" style={{ color: s.diff > 0 ? '#32d74b' : s.diff < 0 ? '#ff453a' : '#7c8696' }}>{s.diff > 0 ? '+' : ''}{s.diff}</span>
          </button>
        ))}
      </div>

      {/* fixtures */}
      <div className="border-t border-ink-800 px-2 py-2">
        <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Fixtures</div>
        <div className="space-y-1">
          {fx.map((f) => {
            const m = findMatch(matches, f[0].id, f[1].id)
            const key = `${f[0].id}:${f[1].id}`
            return (
              <FixtureRow
                key={key}
                a={f[0]}
                b={f[1]}
                match={m}
                open={openKey === key}
                onToggle={() => setOpenKey(openKey === key ? null : key)}
                format={league.format === 'pools→playoff' ? '1 set to 11' : league.format}
                leagueId={league.id}
                eventId={league.eventId}
                store={store}
                onDone={() => { setOpenKey(null); onChanged() }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FixtureRow({
  a,
  b,
  match,
  open,
  onToggle,
  format,
  leagueId,
  eventId,
  store,
  onDone,
}: {
  a: Player
  b: Player
  match?: Match
  open: boolean
  onToggle: () => void
  format: string
  leagueId: string
  eventId: string
  store: Store
  onDone: () => void
}) {
  const [sa, setSa] = useState(11)
  const [sb, setSb] = useState(7)
  const [busy, setBusy] = useState(false)

  if (match) {
    const aWon = match.winnerId === a.id
    const aScore = match.playerAId === a.id ? match.scoreA : match.scoreB
    const bScore = match.playerAId === a.id ? match.scoreB : match.scoreA
    return (
      <div className="flex items-center gap-2 rounded-lg bg-ink-800/50 px-3 py-2 text-sm">
        <span className={`flex-1 truncate text-right ${aWon ? 'font-bold' : 'text-ink-500'}`}>{a.name}</span>
        <span className="font-mono font-bold">{aScore}</span>
        <span className="text-ink-600">:</span>
        <span className="font-mono font-bold">{bScore}</span>
        <span className={`flex-1 truncate ${!aWon ? 'font-bold' : 'text-ink-500'}`}>{b.name}</span>
        <span className="text-win">✓</span>
      </div>
    )
  }

  if (!open) {
    return (
      <button onClick={onToggle} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink-800">
        <span className="flex-1 truncate text-right">{a.name}</span>
        <span className="rounded bg-ink-700 px-2 py-0.5 text-[11px] font-semibold text-ink-300">vs</span>
        <span className="flex-1 truncate">{b.name}</span>
        <span className="text-[11px] font-semibold text-brand-400">enter</span>
      </button>
    )
  }

  const tie = sa === sb
  async function save() {
    if (tie) return
    setBusy(true)
    try {
      const aWon = sa > sb
      await store.recordMatch({
        winnerId: aWon ? a.id : b.id,
        loserId: aWon ? b.id : a.id,
        winnerScore: Math.max(sa, sb),
        loserScore: Math.min(sa, sb),
        format,
        eventId,
        leagueId,
      })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg bg-ink-800 p-3 ring-1 ring-brand/30">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="truncate text-right text-sm font-semibold">{a.name}</div>
        <div className="text-[11px] text-ink-500">{format}</div>
        <div className="truncate text-sm font-semibold">{b.name}</div>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Score value={sa} set={setSa} />
        <span className="text-ink-600">:</span>
        <Score value={sb} set={setSb} />
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={onToggle} className="flex-1 rounded-lg bg-ink-700 py-2 text-xs font-semibold text-ink-300">Cancel</button>
        <button onClick={save} disabled={busy || tie} className="flex-1 rounded-lg bg-brand py-2 text-xs font-bold text-ink-900 disabled:opacity-40">
          {busy ? 'Saving…' : 'Save result'}
        </button>
      </div>
    </div>
  )
}

function Score({ value, set }: { value: number; set: (v: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <button onClick={() => set(Math.max(0, value - 1))} className="grid h-8 w-8 place-items-center rounded-lg bg-ink-900 text-lg font-bold text-ink-500">−</button>
      <span className="w-9 text-center font-mono text-xl font-extrabold">{value}</span>
      <button onClick={() => set(value + 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-ink-900 text-lg font-bold text-ink-500">+</button>
    </div>
  )
}

// ───────────────────────── helpers ─────────────────────────

function fixtures(league: LeagueWithPlayers): [Player, Player][] {
  const rounds = roundRobin(league.players.map((_, i) => i))
  const out: [Player, Player][] = []
  for (const round of rounds) for (const [i, j] of round) out.push([league.players[i], league.players[j]])
  return out
}

function findMatch(matches: Match[], aId: string, bId: string): Match | undefined {
  return matches.find(
    (m) =>
      (m.playerAId === aId && m.playerBId === bId) || (m.playerAId === bId && m.playerBId === aId),
  )
}

interface Standing {
  player: Player
  played: number
  wins: number
  diff: number
}

function computeStandings(league: LeagueWithPlayers, matches: Match[]): Standing[] {
  const ids = new Set(league.players.map((p) => p.id))
  const leagueMatches = matches.filter((m) => ids.has(m.playerAId) && ids.has(m.playerBId))
  const rows: Standing[] = league.players.map((player) => {
    let played = 0
    let wins = 0
    let diff = 0
    for (const m of leagueMatches) {
      if (m.playerAId !== player.id && m.playerBId !== player.id) continue
      played++
      const mine = m.playerAId === player.id ? m.scoreA : m.scoreB
      const theirs = m.playerAId === player.id ? m.scoreB : m.scoreA
      diff += mine - theirs
      if (m.winnerId === player.id) wins++
    }
    return { player, played, wins, diff }
  })
  return rows.sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.player.elo - a.player.elo)
}

function Mini({ label, value, set, min, max, step = 1 }: { label: string; value: number; set: (v: number) => void; min: number; max: number; step?: number }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  return (
    <div className="rounded-lg bg-ink-900 px-2 py-1.5 ring-1 ring-ink-700">
      <div className="text-[10px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="flex items-center justify-between">
        <button onClick={() => set(clamp(value - step))} className="text-ink-500">−</button>
        <span className="font-mono text-sm font-bold">{value}</span>
        <button onClick={() => set(clamp(value + step))} className="text-ink-500">+</button>
      </div>
    </div>
  )
}

function MethodCard({
  active,
  onClick,
  title,
  desc,
  icon,
}: {
  active: boolean
  onClick: () => void
  title: string
  desc: string
  icon: string
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg p-3 text-left transition"
      style={{
        background: active ? '#ff550018' : '#13171e',
        boxShadow: active ? 'inset 0 0 0 1px #ff5500aa' : 'inset 0 0 0 1px #1d2430',
      }}
    >
      <div className="flex items-center gap-1.5">
        <span>{icon}</span>
        <span className="text-sm font-bold" style={{ color: active ? '#ff7a33' : '#e7ebf0' }}>{title}</span>
      </div>
      <div className="mt-1 text-[11px] leading-snug text-ink-500">{desc}</div>
    </button>
  )
}

function NumControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  return (
    <div className="rounded-lg bg-ink-900 p-3 ring-1 ring-ink-700">
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-1.5 flex items-center justify-between">
        <button onClick={() => onChange(clamp(value - 1))} className="grid h-8 w-8 place-items-center rounded-lg bg-ink-800 text-lg font-bold text-ink-400 hover:text-white">−</button>
        <span className="font-mono text-2xl font-extrabold tabular-nums">{value}</span>
        <button onClick={() => onChange(clamp(value + 1))} className="grid h-8 w-8 place-items-center rounded-lg bg-ink-800 text-lg font-bold text-ink-400 hover:text-white">+</button>
      </div>
    </div>
  )
}

function Kpi({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  const color = ok === undefined ? '#fff' : ok ? '#32d74b' : '#ff8a2a'
  return (
    <div className="rounded-xl bg-ink-850 px-4 py-3 ring-1 ring-ink-800">
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="font-mono text-xl font-extrabold" style={{ color }}>{value}</div>
    </div>
  )
}
