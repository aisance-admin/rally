import { useMemo, useRef, useState } from 'react'
import type { EventDetail, LeagueWithPlayers, Match, Player } from '../types'
import type { Store } from '../lib/store'
import { manualSizes, roundRobin } from '../lib/planner'
import { deleteEvent, fetchEventDetail, finishEvent } from '../lib/events'
import { Avatar } from './bits'
import { SkillBadge } from './SkillBadge'
import { Modal } from './Modal'
import { DivisionDraft } from './SeasonDraft'
import {
  buildInitialDivisions,
  computeNextSeasonDivisions,
  groupSeries,
  LEAGUE_COLORS,
  LEAGUE_NAMES,
  maxLeaguesFor,
  seasonRecordsFor,
  type WL,
} from '../lib/seasons'

interface FirstCfg {
  seriesId: string
  name: string
  players: Player[]
  divisions: number
}

export function EventRunner({ store, onSelect }: { store: Store; onSelect: (id: string) => void }) {
  const [view, setView] = useState<'hub' | 'season' | 'setup' | 'draft'>('hub')
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [prevRecords, setPrevRecords] = useState<Map<string, WL> | null>(null)

  const [firstCfg, setFirstCfg] = useState<FirstCfg | null>(null)
  const [firstMethod, setFirstMethod] = useState<'elo' | 'random'>('elo')
  const [reseed, setReseed] = useState(0)
  const [draftPrev, setDraftPrev] = useState<EventDetail | null>(null)

  const openReq = useRef(0)
  const openSeason = async (id: string) => {
    const req = ++openReq.current
    setOpenId(id)
    setView('season')
    setDetail(null)
    setPrevRecords(null)
    setLoadingDetail(true)
    try {
      const d = await fetchEventDetail(id)
      if (openReq.current !== req) return
      setDetail(d)
      if (d.event.season > 1) {
        const prev = store.events.find((e) => e.seriesId === d.event.seriesId && e.season === d.event.season - 1)
        const pr = prev ? seasonRecordsFor(await fetchEventDetail(prev.id)) : null
        if (openReq.current === req) setPrevRecords(pr)
      }
    } finally {
      if (openReq.current === req) setLoadingDetail(false)
    }
  }
  const backToHub = () => { setView('hub'); setOpenId(null); setDetail(null); setFirstCfg(null); setDraftPrev(null) }
  const startNext = async (prevId: string) => { setDraftPrev(await fetchEventDetail(prevId)); setView('draft') }

  const firstDivisions = useMemo(
    () => (firstCfg ? buildInitialDivisions(firstCfg.players, firstCfg.divisions, firstMethod) : []),
    [firstCfg, firstMethod, reseed],
  )
  const nextDivisions = useMemo(() => (draftPrev ? computeNextSeasonDivisions(draftPrev) : []), [draftPrev])
  const nextRecords = useMemo(() => (draftPrev ? seasonRecordsFor(draftPrev) : null), [draftPrev])

  const series = useMemo(() => groupSeries(store.events), [store.events])
  const openSeries = openId ? series.find((s) => s.seasons.some((x) => x.id === openId)) : null
  const isLatestDone = !!(openSeries && detail && openSeries.seasons[openSeries.seasons.length - 1].id === openId && detail.event.status === 'done')

  if (view === 'setup') {
    return (
      <Setup
        store={store}
        onConfigured={(cfg, method) => { setFirstCfg(cfg); setFirstMethod(method); setView('draft') }}
        onCancel={backToHub}
      />
    )
  }

  if (view === 'draft' && firstCfg) {
    return (
      <DivisionDraft
        store={store}
        seriesId={firstCfg.seriesId}
        seriesName={firstCfg.name}
        season={1}
        initialDivisions={firstDivisions}
        subtitle={firstMethod === 'random' ? 'First season · random split' : 'First season · seeded by rating'}
        note={<>Players are split {firstMethod === 'random' ? 'randomly' : 'by rating'}. Move anyone with ▲▼, sit them out with ✕, or add benched players below.</>}
        controls={
          <div className="flex items-center gap-1.5">
            <Seg value={firstMethod} onChange={setFirstMethod} options={[['elo', 'By rating'], ['random', 'Random']]} />
            {firstMethod === 'random' && (
              <button onClick={() => setReseed((r) => r + 1)} className="glass-soft tap rounded-xl px-3 py-2 text-xs font-semibold text-ink-300 hover:text-white">🎲 Reshuffle</button>
            )}
          </div>
        }
        onStarted={(id) => { setFirstCfg(null); openSeason(id) }}
        onCancel={backToHub}
      />
    )
  }

  if (view === 'draft' && draftPrev) {
    return (
      <DivisionDraft
        store={store}
        seriesId={draftPrev.event.seriesId}
        seriesName={draftPrev.event.name}
        season={draftPrev.event.season + 1}
        initialDivisions={nextDivisions}
        prevRecords={nextRecords}
        prevSeasonNo={draftPrev.event.season}
        subtitle={`Re-seeded by Season ${draftPrev.event.season} wins`}
        note={<>Everyone is re-ranked by last season's <span className="text-win">wins</span> (then game difference) — Division 1 holds the players with the most wins. Move anyone by hand with ▲▼.</>}
        onStarted={(id) => { setDraftPrev(null); openSeason(id) }}
        onCancel={backToHub}
      />
    )
  }

  if (view === 'season' && !detail) {
    return (
      <div className="glass grid place-items-center rounded-3xl py-20 text-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink-600 border-t-brand" />
        <span className="mt-3 text-sm text-ink-500">Loading season…</span>
      </div>
    )
  }

  if (view === 'season' && detail) {
    return (
      <SeasonView
        store={store}
        detail={detail}
        loading={loadingDetail}
        readOnly={detail.event.status === 'done'}
        canStartNext={isLatestDone}
        prevRecords={prevRecords}
        onSelect={onSelect}
        onChanged={() => openId && openSeason(openId)}
        onBack={backToHub}
        onStartNext={() => startNext(detail.event.id)}
      />
    )
  }

  return <SeasonHub store={store} onOpen={openSeason} onNewSeries={() => setView('setup')} onStartNext={startNext} />
}

// ───────────────────────── hub ─────────────────────────

function SeasonHub({ store, onOpen, onNewSeries, onStartNext }: { store: Store; onOpen: (id: string) => void; onNewSeries: () => void; onStartNext: (id: string) => void }) {
  const series = useMemo(() => groupSeries(store.events), [store.events])
  const live = store.events.find((e) => e.status === 'live')

  if (store.players.length === 0)
    return <Empty icon="📋" title="No roster yet" body={<>Add players in the <span className="font-semibold text-brand">Roster</span> tab (or load the sample roster) first.</>} />

  if (series.length === 0)
    return (
      <div className="glass grid place-items-center rounded-3xl py-16 text-center">
        <div className="text-5xl">🏆</div>
        <div className="mt-3 text-lg font-semibold">No leagues yet</div>
        <div className="mt-1 max-w-sm text-sm text-ink-500">Start a league and play seasons. Each new season re-seeds players by last season's wins.</div>
        <button onClick={onNewSeries} className="tap mt-5 rounded-2xl bg-gradient-to-br from-brand to-brand2 px-5 py-3 text-sm font-bold text-white glow-brand">＋ Start a league</button>
      </div>
    )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500">Leagues &amp; seasons</h2>
        <button onClick={onNewSeries} className="glass-soft tap rounded-xl px-3 py-2 text-xs font-semibold text-ink-300 hover:text-white">＋ New league</button>
      </div>

      {live && (
        <button onClick={() => onOpen(live.id)} className="glass tap lift flex w-full items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'linear-gradient(90deg, rgba(52,211,153,0.16), rgba(255,255,255,0.04))' }}>
          <span className="h-2 w-2 rounded-full bg-win pulse-dot" />
          <span className="flex-1 text-left text-sm font-bold">Resume {live.name} · Season {live.season}</span>
          <span className="text-xs font-semibold text-win">Open →</span>
        </button>
      )}

      <div className="stagger space-y-4">
        {series.map((s) => {
          const latest = s.seasons[s.seasons.length - 1]
          return (
            <div key={s.seriesId} className="glass overflow-hidden rounded-3xl">
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
                <div>
                  <div className="text-base font-extrabold">{s.name}</div>
                  <div className="text-xs text-ink-500">{s.seasons.length} season{s.seasons.length === 1 ? '' : 's'}</div>
                </div>
                <button onClick={() => onStartNext(latest.id)} className="tap rounded-xl bg-gradient-to-br from-brand to-brand2 px-3.5 py-2 text-xs font-bold text-white glow-brand">⚡ Start Season {latest.season + 1}</button>
              </div>
              <div className="divide-hair border-t hairline">
                {[...s.seasons].reverse().map((ev) => (
                  <button key={ev.id} onClick={() => onOpen(ev.id)} className="tap flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-white/5">
                    <span className="grid h-7 w-7 place-items-center rounded-xl bg-white/8 font-mono text-xs font-bold text-ink-300">S{ev.season}</span>
                    <span className="flex-1 text-sm font-semibold">Season {ev.season}</span>
                    <span className="text-xs text-ink-500">{ev.participantIds.length} players · {ev.tables} divisions</span>
                    <StatusPill status={ev.status} />
                    <span className="text-ink-600">›</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { c: string; t: string }> = {
    done: { c: '#9aa4b2', t: 'Final' },
    live: { c: '#34d399', t: 'Live' },
    draft: { c: '#5aa9ff', t: 'Draft' },
  }
  const s = map[status] ?? map.draft
  return <span className="rounded-lg px-2 py-0.5 text-[11px] font-bold uppercase" style={{ background: `${s.c}22`, color: s.c }}>{s.t}</span>
}

// ───────────────────────── setup ─────────────────────────

function Setup({ store, onConfigured, onCancel }: { store: Store; onConfigured: (cfg: FirstCfg, method: 'elo' | 'random') => void; onCancel?: () => void }) {
  const [name, setName] = useState('League Night')
  const [method, setMethod] = useState<'elo' | 'random'>('elo')
  const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set())
  const [numDiv, setNumDiv] = useState(4)

  const roster = useMemo(() => [...store.players].sort((a, b) => b.elo - a.elo), [store.players])
  const isIn = (id: string) => !unchecked.has(id)
  const count = roster.filter((p) => isIn(p.id)).length

  const maxDiv = maxLeaguesFor(count)
  const divisions = Math.min(Math.max(1, numDiv), maxDiv)
  const sizes = manualSizes(count, divisions)
  const perDiv = divisions > 0 ? Math.round(count / divisions) : 0
  const setPerDiv = (per: number) => { if (per > 0 && count > 0) setNumDiv(Math.max(1, Math.min(maxDiv, Math.round(count / per)))) }
  const toggle = (id: string) => setUnchecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  function go() {
    if (count < 2) return
    onConfigured({ seriesId: crypto.randomUUID(), name: name.trim() || 'League Night', players: store.players.filter((p) => isIn(p.id)), divisions }, method)
  }

  if (store.players.length === 0)
    return <Empty icon="📋" title="No roster yet" body={<>Add players in the <span className="font-semibold text-brand">Roster</span> tab before starting a league.</>} />

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <div className="glass space-y-3 rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500">New league · Season 1</h2>
            {onCancel && <button onClick={onCancel} className="text-xs font-semibold text-ink-500 hover:text-white">← back</button>}
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl bg-white/5 px-3.5 py-2.5 text-sm font-semibold outline-none ring-1 ring-white/10 focus:ring-brand/60" placeholder="League name (e.g. Thursday Night)" />
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-500">First-season split</div>
            <div className="grid grid-cols-2 gap-2">
              <MethodCard active={method === 'elo'} onClick={() => setMethod('elo')} title="By rating" desc="Strongest players seed the top divisions." icon="📊" />
              <MethodCard active={method === 'random'} onClick={() => setMethod('random')} title="Random" desc="Shuffle players across divisions." icon="🎲" />
            </div>
          </div>
        </div>

        <div className="glass space-y-3 rounded-3xl p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500">Divisions</h2>
          <div className="grid grid-cols-2 gap-3">
            <NumControl label="Divisions" value={divisions} min={1} max={maxDiv} onChange={setNumDiv} />
            <NumControl label="Players / division" value={perDiv} min={2} max={Math.max(2, count)} onChange={setPerDiv} />
          </div>
          <p className="text-[11px] text-ink-500">{count} playing → sizes <span className="font-mono text-ink-300">{sizes.join(' · ') || '—'}</span> <span className="text-ink-600">(max {maxDiv})</span></p>
        </div>

        <div className="glass overflow-hidden rounded-3xl">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-bold">Who's playing <span className="text-ink-500">· {count}/{roster.length}</span></span>
            <div className="flex gap-1.5">
              <button onClick={() => setUnchecked(new Set())} className="rounded-lg bg-white/8 px-2 py-1 text-[11px] font-semibold tap">All</button>
              <button onClick={() => setUnchecked(new Set(roster.map((p) => p.id)))} className="rounded-lg bg-white/8 px-2 py-1 text-[11px] font-semibold tap">None</button>
            </div>
          </div>
          <div className="divide-hair max-h-[320px] overflow-y-auto">
            {roster.map((p) => {
              const on = isIn(p.id)
              return (
                <button key={p.id} onClick={() => toggle(p.id)} className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-white/5">
                  <span className="grid h-5 w-5 place-items-center rounded-md text-xs transition" style={{ background: on ? '#34d399' : 'rgba(255,255,255,0.08)', color: on ? '#06080f' : 'transparent' }}>✓</span>
                  <SkillBadge elo={p.elo} size="sm" />
                  <span className="flex-1 truncate text-sm font-semibold transition-opacity" style={{ opacity: on ? 1 : 0.4 }}>{p.name}</span>
                  <span className="font-mono text-xs text-ink-500">{p.elo}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Playing" value={String(count)} />
          <Kpi label="Divisions" value={String(divisions)} />
          <Kpi label="Per division" value={String(perDiv)} />
        </div>

        <div className="glass overflow-hidden rounded-3xl">
          <div className="grid grid-cols-[1fr_90px] gap-2 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            <span>Division</span><span className="text-right">Players</span>
          </div>
          <div className="divide-hair">
            {sizes.map((sz, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px] items-center gap-2 px-5 py-2.5 text-sm">
                <span className="flex items-center gap-2 font-semibold">
                  <span className="h-2 w-2 rounded-full" style={{ background: LEAGUE_COLORS[i] ?? '#9aa4b2', boxShadow: `0 0 10px ${LEAGUE_COLORS[i] ?? '#9aa4b2'}` }} />
                  {LEAGUE_NAMES[i] ?? `Division ${i + 1}`}
                </span>
                <span className="text-right font-mono">{sz}</span>
              </div>
            ))}
            {sizes.length === 0 && <div className="px-5 py-6 text-center text-sm text-ink-500">Check in players to preview divisions.</div>}
          </div>
        </div>

        <button onClick={go} disabled={count < 2} className="tap w-full rounded-2xl bg-gradient-to-br from-brand to-brand2 py-3.5 text-base font-extrabold text-white glow-brand disabled:opacity-40 disabled:shadow-none">
          {count < 2 ? 'Add at least 2 players' : `Build ${divisions} divisions →`}
        </button>
        <p className="text-center text-[11px] text-ink-500">You can drag players between divisions on the next screen.</p>
      </div>
    </div>
  )
}

// ───────────────────────── season view (live or final) ─────────────────────────

function SeasonView({ store, detail, loading, readOnly, canStartNext, prevRecords, onSelect, onChanged, onBack, onStartNext }: {
  store: Store; detail: EventDetail; loading: boolean; readOnly: boolean; canStartNext: boolean; prevRecords?: Map<string, WL> | null; onSelect: (id: string) => void; onChanged: () => void; onBack: () => void; onStartNext: () => void
}) {
  const [confirmFinish, setConfirmFinish] = useState(false)
  const totalFx = detail.leagues.reduce((s, l) => s + fixtures(l).length, 0)
  const playedFx = detail.leagues.reduce((s, l) => s + fixtures(l).filter((f) => findMatch(detail.matches, f[0].id, f[1].id)).length, 0)
  const pct = totalFx ? Math.round((playedFx / totalFx) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onBack} className="glass-soft tap flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-ink-300 hover:text-white" title="Back to all leagues">← Leagues</button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {readOnly ? <span className="h-2 w-2 rounded-full bg-ink-500" /> : <span className="h-2 w-2 rounded-full bg-win pulse-dot" />}
              <span className="truncate text-lg font-extrabold">{detail.event.name}</span>
              <span className="rounded-lg bg-white/8 px-2 py-0.5 text-[11px] font-bold uppercase text-ink-300">Season {detail.event.season}</span>
              <StatusPill status={detail.event.status} />
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-500">
              <span>{detail.event.participantIds.length} players · {detail.leagues.length} divisions</span>
              <span className="h-1 w-20 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: readOnly ? '#9aa4b2' : '#34d399' }} /></span>
              <span>{playedFx}/{totalFx}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {readOnly ? (
            canStartNext && <button onClick={onStartNext} className="tap rounded-xl bg-gradient-to-br from-brand to-brand2 px-3.5 py-2 text-xs font-bold text-white glow-brand">⚡ Start Season {detail.event.season + 1}</button>
          ) : (
            <>
              <button onClick={async () => { await deleteEvent(detail.event.id); await store.refresh(); onBack() }} className="glass-soft tap rounded-xl px-3 py-2 text-xs font-semibold text-ink-500 hover:text-loss">Discard</button>
              <button onClick={() => setConfirmFinish(true)} className="tap rounded-xl bg-gradient-to-br from-brand to-brand2 px-3.5 py-2 text-xs font-bold text-white glow-brand">✓ Finish</button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {detail.leagues.map((l) => (
          <LeagueCard key={l.id} league={l} matches={detail.matches} readOnly={readOnly} prevRecords={prevRecords} store={store} onSelect={onSelect} onChanged={onChanged} />
        ))}
      </div>

      {loading && <div className="text-center text-xs text-ink-500">syncing…</div>}

      {confirmFinish && (
        <Modal onClose={() => setConfirmFinish(false)}>
          <div className="px-5 py-5">
            <h3 className="text-lg font-bold">Finish this season?</h3>
            <p className="mt-1 text-sm text-ink-500">Ratings are saved after each match. Finishing keeps the season viewable in the hub, and lets you start the next one (re-seeded by wins).</p>
          </div>
          <div className="flex gap-2 border-t hairline px-5 py-4">
            <button onClick={() => setConfirmFinish(false)} className="glass-soft tap flex-1 rounded-xl py-2.5 text-sm font-semibold text-ink-300">Keep open</button>
            <button onClick={async () => { await finishEvent(detail.event.id); await store.refresh(); setConfirmFinish(false); onChanged() }} className="tap flex-1 rounded-xl bg-gradient-to-br from-brand to-brand2 py-2.5 text-sm font-bold text-white glow-brand">Finish season</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function LeagueCard({ league, matches, readOnly, prevRecords, store, onSelect, onChanged }: {
  league: LeagueWithPlayers; matches: Match[]; readOnly: boolean; prevRecords?: Map<string, WL> | null; store: Store; onSelect: (id: string) => void; onChanged: () => void
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const fx = fixtures(league)
  const played = fx.filter((f) => findMatch(matches, f[0].id, f[1].id)).length
  const standings = computeStandings(league, matches)

  return (
    <div className="glass overflow-hidden rounded-3xl lift">
      <div className="flex items-center justify-between px-4 py-3" style={{ background: `linear-gradient(90deg, ${league.color}26, transparent)` }}>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: league.color, boxShadow: `0 0 12px ${league.color}` }} />
          <span className="font-bold">{league.name}</span>
          <span className="text-[11px] text-ink-500">{league.format}</span>
        </div>
        <span className="text-xs font-semibold text-ink-500">{played}/{fx.length}</span>
      </div>

      <div className="px-2 py-1">
        <div className="grid grid-cols-[20px_1fr_28px_28px_36px] gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
          <span></span><span>Player</span><span className="text-center">P</span><span className="text-center">W</span><span className="text-right">+/-</span>
        </div>
        {standings.map((s, i) => (
          <button key={s.player.id} onClick={() => onSelect(s.player.id)} className="tap grid w-full grid-cols-[20px_1fr_28px_28px_36px] items-center gap-1 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-white/5">
            <span className="text-center text-xs font-bold text-ink-500">{i + 1}</span>
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={s.player.name} size={22} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate font-semibold">{s.player.name}</span>
                {prevRecords && (
                  <span className="block text-[10px] text-ink-500">last: {prevRecords.has(s.player.id) ? `${prevRecords.get(s.player.id)!.wins}-${prevRecords.get(s.player.id)!.losses}` : 'new'}</span>
                )}
              </span>
            </span>
            <span className="text-center font-mono text-xs text-ink-500">{s.played}</span>
            <span className="text-center font-mono text-xs text-win">{s.wins}</span>
            <span className="text-right font-mono text-xs" style={{ color: s.diff > 0 ? '#34d399' : s.diff < 0 ? '#fb6f7d' : '#7c8696' }}>{s.diff > 0 ? '+' : ''}{s.diff}</span>
          </button>
        ))}
      </div>

      <div className="border-t hairline px-2 py-2">
        <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Fixtures</div>
        <div className="space-y-1">
          {fx.map((f) => {
            const m = findMatch(matches, f[0].id, f[1].id)
            const key = `${f[0].id}:${f[1].id}`
            return (
              <FixtureRow key={key} a={f[0]} b={f[1]} match={m} readOnly={readOnly} open={openKey === key} onToggle={() => setOpenKey(openKey === key ? null : key)} format={league.format} leagueId={league.id} eventId={league.eventId} store={store} onDone={() => { setOpenKey(null); onChanged() }} />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FixtureRow({ a, b, match, readOnly, open, onToggle, format, leagueId, eventId, store, onDone }: {
  a: Player; b: Player; match?: Match; readOnly: boolean; open: boolean; onToggle: () => void; format: string; leagueId: string; eventId: string; store: Store; onDone: () => void
}) {
  const [sa, setSa] = useState(11)
  const [sb, setSb] = useState(7)
  const [busy, setBusy] = useState(false)

  if (match) {
    const aWon = match.winnerId === a.id
    const aScore = match.playerAId === a.id ? match.scoreA : match.scoreB
    const bScore = match.playerAId === a.id ? match.scoreB : match.scoreA
    return (
      <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-sm">
        <span className={`flex-1 truncate text-right ${aWon ? 'font-bold' : 'text-ink-500'}`}>{a.name}</span>
        <span className="font-mono font-bold">{aScore}</span><span className="text-ink-600">:</span><span className="font-mono font-bold">{bScore}</span>
        <span className={`flex-1 truncate ${!aWon ? 'font-bold' : 'text-ink-500'}`}>{b.name}</span>
        <span className="text-win">✓</span>
      </div>
    )
  }

  if (readOnly) {
    return (
      <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-500">
        <span className="flex-1 truncate text-right">{a.name}</span>
        <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px]">vs</span>
        <span className="flex-1 truncate">{b.name}</span>
        <span className="text-[10px] uppercase">unplayed</span>
      </div>
    )
  }

  if (!open) {
    return (
      <button onClick={onToggle} className="tap flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-white/5">
        <span className="flex-1 truncate text-right">{a.name}</span>
        <span className="rounded-md bg-white/8 px-2 py-0.5 text-[11px] font-semibold text-ink-300">vs</span>
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
      await store.recordMatch({ winnerId: aWon ? a.id : b.id, loserId: aWon ? b.id : a.id, winnerScore: Math.max(sa, sb), loserScore: Math.min(sa, sb), format, eventId, leagueId })
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <div className="animate-pop rounded-2xl bg-white/[0.05] p-3 ring-1 ring-brand/30">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="truncate text-right text-sm font-semibold">{a.name}</div>
        <div className="text-[11px] text-ink-500">{format}</div>
        <div className="truncate text-sm font-semibold">{b.name}</div>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Score value={sa} set={setSa} /><span className="text-ink-600">:</span><Score value={sb} set={setSb} />
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={onToggle} className="glass-soft tap flex-1 rounded-xl py-2 text-xs font-semibold text-ink-300">Cancel</button>
        <button onClick={save} disabled={busy || tie} className="tap flex-1 rounded-xl bg-gradient-to-br from-brand to-brand2 py-2 text-xs font-bold text-white glow-brand disabled:opacity-40 disabled:shadow-none">{busy ? 'Saving…' : 'Save result'}</button>
      </div>
    </div>
  )
}

function Score({ value, set }: { value: number; set: (v: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <button onClick={() => set(Math.max(0, value - 1))} className="tap grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-lg font-bold text-ink-400 hover:text-white">−</button>
      <span className="w-9 text-center font-mono text-2xl font-extrabold tabular-nums">{value}</span>
      <button onClick={() => set(value + 1)} className="tap grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-lg font-bold text-ink-400 hover:text-white">+</button>
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
  return matches.find((m) => (m.playerAId === aId && m.playerBId === bId) || (m.playerAId === bId && m.playerBId === aId))
}

interface Standing { player: Player; played: number; wins: number; diff: number }
function computeStandings(league: LeagueWithPlayers, matches: Match[]): Standing[] {
  const ids = new Set(league.players.map((p) => p.id))
  const lm = matches.filter((m) => ids.has(m.playerAId) && ids.has(m.playerBId))
  const rows: Standing[] = league.players.map((player) => {
    let played = 0, wins = 0, diff = 0
    for (const m of lm) {
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

// ───────────────────────── small UI ─────────────────────────

function Empty({ icon, title, body }: { icon: string; title: string; body: React.ReactNode }) {
  return (
    <div className="glass grid place-items-center rounded-3xl py-16 text-center">
      <div className="text-5xl">{icon}</div>
      <div className="mt-3 text-lg font-semibold">{title}</div>
      <div className="mt-1 max-w-sm text-sm text-ink-500">{body}</div>
    </div>
  )
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="glass-soft flex items-center gap-0.5 rounded-xl p-0.5">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={`tap rounded-lg px-3 py-1.5 text-xs font-bold transition ${value === v ? 'bg-white/12 text-white' : 'text-ink-500 hover:text-ink-300'}`}>{label}</button>
      ))}
    </div>
  )
}

function MethodCard({ active, onClick, title, desc, icon }: { active: boolean; onClick: () => void; title: string; desc: string; icon: string }) {
  return (
    <button onClick={onClick} className="tap rounded-2xl p-3 text-left transition" style={{ background: active ? 'rgba(255,106,61,0.12)' : 'rgba(255,255,255,0.04)', boxShadow: active ? 'inset 0 0 0 1.5px rgba(255,106,61,0.7)' : 'inset 0 0 0 1px rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-1.5">
        <span>{icon}</span>
        <span className="text-sm font-bold" style={{ color: active ? '#ff8a5e' : '#eef1f7' }}>{title}</span>
      </div>
      <div className="mt-1 text-[11px] leading-snug text-ink-500">{desc}</div>
    </button>
  )
}

function NumControl({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  return (
    <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/8">
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-1.5 flex items-center justify-between">
        <button onClick={() => onChange(clamp(value - 1))} className="tap grid h-8 w-8 place-items-center rounded-xl bg-white/8 text-lg font-bold text-ink-400 hover:text-white">−</button>
        <span className="font-mono text-2xl font-extrabold tabular-nums">{value}</span>
        <button onClick={() => onChange(clamp(value + 1))} className="tap grid h-8 w-8 place-items-center rounded-xl bg-white/8 text-lg font-bold text-ink-400 hover:text-white">+</button>
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="font-mono text-xl font-extrabold">{value}</div>
    </div>
  )
}
