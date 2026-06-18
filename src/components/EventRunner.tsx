import { useMemo, useRef, useState } from 'react'
import { Reorder } from 'framer-motion'
import type { EventDetail, LeagueWithPlayers, Match, Player } from '../types'
import type { MatchOpResult } from '../lib/api'
import type { Store } from '../lib/store'
import { manualSizes, roundRobin } from '../lib/planner'
import { deleteEvent, fetchEventDetail, finishEvent, reopenEvent } from '../lib/events'
import { Avatar, nameMatches, SearchInput } from './bits'
import { SkillBadge } from './SkillBadge'
import { Modal } from './Modal'
import { DivisionDraft } from './SeasonDraft'
import { GroupSheet, TieChip } from './GroupSheet'
import {
  buildDivisionsFromQualifier,
  buildInitialDivisions,
  DEFAULT_PROMOTION,
  defaultQualifierMapping,
  type DraftDivision,
  explainPlacement,
  type FormationMode,
  generateNextSeasonDivisions,
  groupSeries,
  LEAGUE_COLORS,
  LEAGUE_NAMES,
  maxLeaguesFor,
  parseFormat,
  type PositionRule,
  previewDivisionSizes,
  type PromotionConfig,
  type QualSplit,
  rankDivision,
  type RankedPlayer,
  seasonRecordsFor,
  tierByPlayer,
  type WL,
} from '../lib/seasons'

interface FirstCfg {
  seriesId: string
  name: string
  players: Player[]
  divisions: number
  qualifier: boolean
}

type View = 'hub' | 'season' | 'setup' | 'draft' | 'qualDraft' | 'mapping'

export function EventRunner({ store, onSelect }: { store: Store; onSelect: (id: string) => void }) {
  const [view, setView] = useState<View>('hub')
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [prevRecords, setPrevRecords] = useState<Map<string, WL> | null>(null)
  const [prevTiers, setPrevTiers] = useState<Map<string, number> | null>(null)

  const [firstCfg, setFirstCfg] = useState<FirstCfg | null>(null)
  const [firstMethod, setFirstMethod] = useState<FormationMode>('block')
  const [seedOrder, setSeedOrder] = useState<Player[]>([])
  const [seedEditorOpen, setSeedEditorOpen] = useState(false)
  const [format, setFormat] = useState('1 set to 11')
  const [reseed, setReseed] = useState(0)
  const [draftPrev, setDraftPrev] = useState<EventDetail | null>(null)
  const [promotionCfg, setPromotionCfg] = useState<PromotionConfig>(DEFAULT_PROMOTION)

  // qualifier → divisions flow
  const [builtDivisions, setBuiltDivisions] = useState<DraftDivision[] | null>(null)
  const [qualEventId, setQualEventId] = useState<string | null>(null)
  const [mapDetail, setMapDetail] = useState<EventDetail | null>(null)
  const [mapping, setMapping] = useState<Record<number, PositionRule>>({})
  const [qualSplit, setQualSplit] = useState<QualSplit>('random')

  const openReq = useRef(0)
  const openSeason = async (id: string) => {
    const req = ++openReq.current
    setOpenId(id)
    setView('season')
    setDetail(null)
    setPrevRecords(null)
    setPrevTiers(null)
    setLoadingDetail(true)
    try {
      const d = await fetchEventDetail(id)
      if (openReq.current !== req) return
      setDetail(d)
      if (d.event.season > 1) {
        const prev = store.events.find((e) => e.seriesId === d.event.seriesId && e.season === d.event.season - 1)
        if (prev && prev.season >= 1) {
          const pd = await fetchEventDetail(prev.id)
          if (openReq.current === req) { setPrevRecords(seasonRecordsFor(pd)); setPrevTiers(tierByPlayer(pd)) }
        }
      }
    } finally {
      if (openReq.current === req) setLoadingDetail(false)
    }
  }
  const backToHub = () => { setView('hub'); setOpenId(null); setDetail(null); setFirstCfg(null); setDraftPrev(null); setBuiltDivisions(null); setQualEventId(null); setMapDetail(null) }
  const startNext = async (prevId: string) => { setDraftPrev(await fetchEventDetail(prevId)); setView('draft') }

  const firstDivisions = useMemo(() => {
    if (builtDivisions) return builtDivisions
    if (!firstCfg) return []
    return applyHandicaps(buildInitialDivisions(seedOrder.length ? seedOrder : firstCfg.players, firstCfg.divisions, firstMethod, { reseed }))
  }, [firstCfg, firstMethod, reseed, builtDivisions, seedOrder])
  const nextDivisions = useMemo(() => (draftPrev ? generateNextSeasonDivisions(draftPrev, promotionCfg) : []), [draftPrev, promotionCfg])
  const nextRecords = useMemo(() => (draftPrev ? seasonRecordsFor(draftPrev) : null), [draftPrev])
  const nextPreview = useMemo(() => {
    if (!draftPrev) return null
    const orig = [...draftPrev.leagues].sort((a, b) => a.tier - b.tier).map((l) => l.players)
    return previewDivisionSizes(orig, promotionCfg)
  }, [draftPrev, promotionCfg])

  const series = useMemo(() => groupSeries(store.events), [store.events])
  const openSeries = openId ? series.find((s) => s.seasons.some((x) => x.id === openId)) : null
  const isLatestDone = !!(openSeries && detail && openSeries.seasons[openSeries.seasons.length - 1].id === openId && detail.event.status === 'done')

  const seeded = firstMethod === 'block' || firstMethod === 'snake' || firstMethod === 'pots'
  const formatControls = (withReshuffle: boolean) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Seg value={firstMethod} onChange={setFirstMethod} options={[['block', 'By rating'], ['snake', 'Snake'], ['pots', 'Pots'], ['random', 'Random'], ['manual', 'Manual']]} />
      <FormatControl value={format} onChange={setFormat} />
      {seeded && <button onClick={() => setSeedEditorOpen(true)} className="glass-soft tap rounded-xl px-3 py-2 text-xs font-semibold text-ink-300 hover:text-white" title="Reorder the seed list (1 = strongest)">⇅ Seed order</button>}
      {withReshuffle && (firstMethod === 'random' || firstMethod === 'pots') && (
        <button onClick={() => setReseed((r) => r + 1)} className="glass-soft tap rounded-xl px-3 py-2 text-xs font-semibold text-ink-300 hover:text-white">🎲 Reshuffle</button>
      )}
    </div>
  )

  if (view === 'setup') {
    return (
      <Setup
        store={store}
        onConfigured={(cfg, method, fmt) => { setFirstCfg(cfg); setFirstMethod(method); setFormat(fmt); setSeedOrder([...cfg.players].sort((a, b) => b.elo - a.elo)); setBuiltDivisions(null); setQualEventId(null); setView(cfg.qualifier ? 'qualDraft' : 'draft') }}
        onCancel={backToHub}
      />
    )
  }

  // qualifier seeding round — form the qualification groups
  if (view === 'qualDraft' && firstCfg) {
    return (
      <>
        <DivisionDraft
          store={store}
          seriesId={firstCfg.seriesId}
          seriesName={firstCfg.name}
          season={0}
          initialDivisions={firstDivisions}
          subtitle="Qualifier · seeding groups"
          startLabel="Start qualifier"
          createOpts={{ status: 'qualifying', format }}
          note={<>Everyone plays these groups first. Their finishing position decides which division they start in. {firstMethod === 'manual' ? 'Add players to each group below.' : firstMethod === 'pots' ? 'Drawn from seeded pots.' : 'Move anyone with ▲▼.'}</>}
          controls={formatControls(true)}
          reveal={firstMethod === 'pots' || firstMethod === 'random' ? reseed : undefined}
          onStarted={(id) => openSeason(id)}
          onCancel={backToHub}
        />
        {seedEditorOpen && <SeedListModal order={seedOrder} onChange={setSeedOrder} onClose={() => setSeedEditorOpen(false)} />}
      </>
    )
  }

  // first season (direct) OR season 1 built from a finished qualifier
  if (view === 'draft' && firstCfg) {
    const fromQual = !!builtDivisions
    return (
      <>
        <DivisionDraft
          store={store}
          seriesId={firstCfg.seriesId}
          seriesName={firstCfg.name}
          season={1}
          initialDivisions={firstDivisions}
          subtitle={fromQual ? 'Season 1 · seeded from qualifier' : firstMethod === 'random' ? 'First season · random split' : firstMethod === 'manual' ? 'First season · place players by hand' : firstMethod === 'snake' ? 'First season · snake seeding' : firstMethod === 'pots' ? 'First season · seeded pots' : 'First season · seeded by rating'}
          createOpts={{ status: 'live', format }}
          note={fromQual
            ? <>Divisions built from the qualifier results. Adjust anyone with ▲▼ before you start.</>
            : <>Players are split {firstMethod === 'random' ? 'randomly' : firstMethod === 'manual' ? 'by you' : firstMethod === 'snake' ? 'snake-style for balanced groups' : firstMethod === 'pots' ? 'from seeded pots' : 'by rating'}. Move anyone with ▲▼, sit them out with ✕, or add benched players below.</>}
          controls={fromQual ? <FormatControl value={format} onChange={setFormat} /> : formatControls(true)}
          reveal={!fromQual && (firstMethod === 'pots' || firstMethod === 'random') ? reseed : undefined}
          onStarted={async (id) => {
            if (qualEventId) { await finishEvent(qualEventId); setQualEventId(null); await store.refresh() }
            setBuiltDivisions(null); setFirstCfg(null); openSeason(id)
          }}
          onCancel={backToHub}
        />
        {seedEditorOpen && <SeedListModal order={seedOrder} onChange={setSeedOrder} onClose={() => setSeedEditorOpen(false)} />}
      </>
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
        subtitle={`Promotion / relegation from Season ${draftPrev.event.season}`}
        createOpts={{ status: 'live', format }}
        note={<>Divisions are kept. The top {promotionCfg.up} of each division move <span className="text-win">up</span>, the bottom {promotionCfg.down} move <span className="text-loss">down</span> — everyone else stays. {nextPreview?.warning && <span className="text-brand-400"> {nextPreview.warning}</span>}</>}
        controls={<div className="flex flex-wrap items-center gap-1.5"><PromoteControl cfg={promotionCfg} onChange={setPromotionCfg} divisions={[...draftPrev.leagues].sort((a, b) => a.tier - b.tier).map((l) => ({ name: l.name, color: l.color }))} /><FormatControl value={format} onChange={setFormat} /></div>}
        onStarted={(id) => { setDraftPrev(null); openSeason(id) }}
        onCancel={backToHub}
      />
    )
  }

  if (view === 'mapping' && mapDetail) {
    return (
      <MappingEditor
        qual={mapDetail}
        mapping={mapping}
        onChange={setMapping}
        split={qualSplit}
        onSplitChange={setQualSplit}
        onBuild={(divs) => {
          setBuiltDivisions(divs)
          setQualEventId(mapDetail.event.id)
          setFirstCfg({ seriesId: mapDetail.event.seriesId, name: mapDetail.event.name, players: [], divisions: divs.length, qualifier: false })
          setView('draft')
        }}
        onCancel={() => openSeason(mapDetail.event.id)}
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
        key={detail.event.id}
        store={store}
        detail={detail}
        loading={loadingDetail}
        readOnly={detail.event.status === 'done'}
        canStartNext={isLatestDone}
        prevRecords={prevRecords}
        prevTiers={prevTiers}
        onSelect={onSelect}
        onChanged={() => openId && openSeason(openId)}
        onBack={backToHub}
        onStartNext={() => startNext(detail.event.id)}
        onReopen={async () => { await reopenEvent(detail.event.id); await store.refresh(); openSeason(detail.event.id) }}
        onFormDivisions={() => {
          const maxPos = Math.max(1, ...detail.leagues.map((l) => l.players.length))
          setMapDetail(detail)
          setMapping(defaultQualifierMapping(maxPos))
          setView('mapping')
        }}
      />
    )
  }

  return <SeasonHub store={store} onOpen={openSeason} onNewSeries={() => setView('setup')} onStartNext={startNext} />
}

// ───────────────────────── hub ─────────────────────────

function SeasonHub({ store, onOpen, onNewSeries, onStartNext }: { store: Store; onOpen: (id: string) => void; onNewSeries: () => void; onStartNext: (id: string) => void }) {
  const series = useMemo(() => groupSeries(store.events), [store.events])
  const live = store.events.find((e) => e.status === 'live' || e.status === 'qualifying')

  if (store.players.length === 0)
    return <Empty icon="📋" title="No roster yet" body={<>Add players in the <span className="font-semibold text-brand">Roster</span> tab (or load the sample roster) first.</>} />

  if (series.length === 0)
    return (
      <div className="glass grid place-items-center rounded-3xl py-16 text-center">
        <div className="text-5xl">🏆</div>
        <div className="mt-3 text-lg font-semibold">No leagues yet</div>
        <div className="mt-1 max-w-sm text-sm text-ink-500">Start a league and play seasons. Each season, the winner of every division goes up and the last goes down.</div>
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
          <span className="flex-1 text-left text-sm font-bold">Resume {live.name} · {live.status === 'qualifying' ? 'Qualifier' : `Season ${live.season}`}</span>
          <span className="text-xs font-semibold text-win">Open →</span>
        </button>
      )}

      <div className="stagger space-y-4">
        {series.map((s) => {
          const latest = s.seasons[s.seasons.length - 1]
          const seasonsOnly = s.seasons.filter((e) => e.season >= 1)
          const topSeason = seasonsOnly.length ? seasonsOnly[seasonsOnly.length - 1].season : 0
          return (
            <div key={s.seriesId} className="glass overflow-hidden rounded-3xl">
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
                <div>
                  <div className="text-base font-extrabold">{s.name}</div>
                  <div className="text-xs text-ink-500">{seasonsOnly.length} season{seasonsOnly.length === 1 ? '' : 's'}</div>
                </div>
                {latest.status === 'done' && (
                  <button onClick={() => onStartNext(latest.id)} className="tap rounded-xl bg-gradient-to-br from-brand to-brand2 px-3.5 py-2 text-xs font-bold text-white glow-brand">⚡ Start Season {topSeason + 1}</button>
                )}
              </div>
              <div className="divide-hair border-t hairline">
                {[...s.seasons].reverse().map((ev) => (
                  <button key={ev.id} onClick={() => onOpen(ev.id)} className="tap flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-white/5">
                    <span className="grid h-7 w-7 place-items-center rounded-xl bg-white/8 font-mono text-xs font-bold text-ink-300">{ev.season >= 1 ? `S${ev.season}` : 'Q'}</span>
                    <span className="flex-1 text-sm font-semibold">{ev.season >= 1 ? `Season ${ev.season}` : 'Qualifier'}</span>
                    <span className="text-xs text-ink-500">{ev.participantIds.length} players · {ev.tables} {ev.season >= 1 ? 'divisions' : 'groups'}</span>
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
    qualifying: { c: '#ff8a3d', t: 'Qualifier' },
    draft: { c: '#5aa9ff', t: 'Draft' },
  }
  const s = map[status] ?? map.draft
  return <span className="rounded-lg px-2 py-0.5 text-[11px] font-bold uppercase" style={{ background: `${s.c}22`, color: s.c }}>{s.t}</span>
}

// ───────────────────────── setup ─────────────────────────

function Setup({ store, onConfigured, onCancel }: { store: Store; onConfigured: (cfg: FirstCfg, method: FormationMode, format: string) => void; onCancel?: () => void }) {
  const [name, setName] = useState('League Night')
  const [method, setMethod] = useState<FormationMode>('block')
  const [format, setFormat] = useState('1 set to 11')
  const [qualifier, setQualifier] = useState(false)
  const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set())
  const [numDiv, setNumDiv] = useState(4)

  const roster = useMemo(() => [...store.players].sort((a, b) => b.elo - a.elo), [store.players])
  const [rosterQ, setRosterQ] = useState('')
  const isIn = (id: string) => !unchecked.has(id)
  const count = roster.filter((p) => isIn(p.id)).length

  const maxDiv = maxLeaguesFor(count)
  const divisions = Math.min(Math.max(1, numDiv), maxDiv)
  const sizes = manualSizes(count, divisions)
  const perDiv = divisions > 0 ? Math.round(count / divisions) : 0
  const setPerDiv = (per: number) => { if (per > 0 && count > 0) setNumDiv(Math.max(1, Math.min(maxDiv, Math.round(count / per)))) }
  const toggle = (id: string) => setUnchecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const unit = qualifier ? 'groups' : 'divisions'

  function go() {
    if (count < 2) return
    onConfigured({ seriesId: crypto.randomUUID(), name: name.trim() || 'League Night', players: store.players.filter((p) => isIn(p.id)), divisions, qualifier }, method, format)
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
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-500">{qualifier ? 'How qualifier groups are formed' : 'First-season split'}</div>
            <div className="grid grid-cols-3 gap-2">
              <MethodCard active={method === 'block'} onClick={() => setMethod('block')} title="By rating" desc={qualifier ? 'Top seeds together.' : 'Top seeds in Div 1.'} icon="📊" />
              <MethodCard active={method === 'snake'} onClick={() => setMethod('snake')} title="Snake" desc="Balanced groups." icon="🐍" />
              <MethodCard active={method === 'pots'} onClick={() => setMethod('pots')} title="Pots" desc="World-Cup draw." icon="🏆" />
              <MethodCard active={method === 'random'} onClick={() => setMethod('random')} title="Random" desc="Shuffle everyone." icon="🎲" />
              <MethodCard active={method === 'manual'} onClick={() => setMethod('manual')} title="Manual" desc="Place by hand." icon="✋" />
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-500">Match format</div>
            <FormatControl value={format} onChange={setFormat} />
          </div>
          <button onClick={() => setQualifier((q) => !q)} className="tap flex w-full items-center justify-between rounded-2xl bg-white/5 px-3.5 py-2.5 ring-1 ring-white/8">
            <span className="text-left">
              <span className="block text-sm font-semibold">Run a qualifier first</span>
              <span className="block text-[11px] text-ink-500">Everyone plays seeding groups; results set the divisions.</span>
            </span>
            <span className={`grid h-6 w-11 place-items-start rounded-full p-0.5 transition ${qualifier ? 'bg-win/80' : 'bg-white/12'}`}>
              <span className="h-5 w-5 rounded-full bg-white transition-transform" style={{ transform: qualifier ? 'translateX(20px)' : 'translateX(0)' }} />
            </span>
          </button>
        </div>

        <div className="glass space-y-3 rounded-3xl p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500">{qualifier ? 'Qualifier groups' : 'Divisions'}</h2>
          <div className="grid grid-cols-2 gap-3">
            <NumControl label={qualifier ? 'Groups' : 'Divisions'} value={divisions} min={1} max={maxDiv} onChange={setNumDiv} />
            <NumControl label={`Players / ${qualifier ? 'group' : 'division'}`} value={perDiv} min={2} max={Math.max(2, count)} onChange={setPerDiv} />
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
          <div className="px-3 pb-2"><SearchInput value={rosterQ} onChange={setRosterQ} placeholder="Find a player…" /></div>
          <div className="divide-hair max-h-[320px] overflow-y-auto">
            {roster.filter((p) => nameMatches(p, rosterQ)).map((p) => {
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
          <Kpi label={qualifier ? 'Groups' : 'Divisions'} value={String(divisions)} />
          <Kpi label={`Per ${qualifier ? 'group' : 'division'}`} value={String(perDiv)} />
        </div>

        <div className="glass overflow-hidden rounded-3xl">
          <div className="grid grid-cols-[1fr_90px] gap-2 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            <span>{qualifier ? 'Group' : 'Division'}</span><span className="text-right">Players</span>
          </div>
          <div className="divide-hair">
            {sizes.map((sz, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px] items-center gap-2 px-5 py-2.5 text-sm">
                <span className="flex items-center gap-2 font-semibold">
                  <span className="h-2 w-2 rounded-full" style={{ background: LEAGUE_COLORS[i] ?? '#9aa4b2', boxShadow: `0 0 10px ${LEAGUE_COLORS[i] ?? '#9aa4b2'}` }} />
                  {qualifier ? `Group ${i + 1}` : LEAGUE_NAMES[i] ?? `Division ${i + 1}`}
                </span>
                <span className="text-right font-mono">{sz}</span>
              </div>
            ))}
            {sizes.length === 0 && <div className="px-5 py-6 text-center text-sm text-ink-500">Check in players to preview {unit}.</div>}
          </div>
        </div>

        <button onClick={go} disabled={count < 2} className="tap w-full rounded-2xl bg-gradient-to-br from-brand to-brand2 py-3.5 text-base font-extrabold text-white glow-brand disabled:opacity-40 disabled:shadow-none">
          {count < 2 ? 'Add at least 2 players' : qualifier ? `Build ${divisions} qualifier groups →` : `Build ${divisions} divisions →`}
        </button>
        <p className="text-center text-[11px] text-ink-500">You can adjust everything on the next screen.</p>
      </div>
    </div>
  )
}

// ───────────────────────── qualifier → division mapping (spec §6) ─────────────────────────

function MappingEditor({ qual, mapping, onChange, split, onSplitChange, onBuild, onCancel }: {
  qual: EventDetail; mapping: Record<number, PositionRule>; onChange: (m: Record<number, PositionRule>) => void; split: QualSplit; onSplitChange: (s: QualSplit) => void; onBuild: (divs: DraftDivision[]) => void; onCancel: () => void
}) {
  const maxPos = Math.max(1, ...qual.leagues.map((l) => l.players.length))
  const preview = useMemo(() => buildDivisionsFromQualifier(qual, mapping, split), [qual, mapping, split])
  const maxDiv = preview.length
  const ruleOf = (pos: number): PositionRule => mapping[pos] ?? { div: pos, span: 1 }
  const setRule = (pos: number, patch: Partial<PositionRule>) => {
    const r = ruleOf(pos)
    onChange({ ...mapping, [pos]: { div: Math.max(1, patch.div ?? r.div), span: Math.max(1, patch.span ?? r.span) } })
  }
  const anySplit = Array.from({ length: maxPos }, (_, i) => ruleOf(i + 1)).some((r) => r.span > 1)
  const divLabel = (rule: PositionRule) =>
    rule.span <= 1
      ? LEAGUE_NAMES[rule.div - 1] ?? `Div ${rule.div}`
      : `Div ${rule.div}–${rule.div + rule.span - 1}`

  return (
    <div className="space-y-4">
      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4">
        <div>
          <div className="text-lg font-extrabold">Form divisions from the qualifier</div>
          <div className="mt-0.5 text-xs text-ink-500">Each finishing position feeds a division (or several). Default: 1st of every group → Division 1, 2nd → Division 2, …</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="glass-soft tap rounded-xl px-3 py-2 text-xs font-semibold text-ink-400 hover:text-white">Cancel</button>
          <button onClick={() => onBuild(preview)} disabled={!preview.length} className="tap rounded-xl bg-gradient-to-br from-brand to-brand2 px-4 py-2 text-xs font-bold text-white glow-brand disabled:opacity-40">Build Season 1 →</button>
        </div>
      </div>

      {anySplit && (
        <div className="glass-soft flex flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">When one position feeds several divisions, split by</span>
          <Seg value={split} onChange={onSplitChange} options={[['random', 'Random'], ['points', 'By points'], ['seed', 'By seed']]} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass overflow-hidden rounded-3xl">
          <div className="grid grid-cols-[1fr_auto_auto_64px] gap-2 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
            <span>Finished</span><span className="text-center">Division</span><span className="text-center">Spread</span><span className="text-right">Lands in</span>
          </div>
          <div className="divide-hair">
            {Array.from({ length: maxPos }, (_, i) => i + 1).map((pos) => {
              const r = ruleOf(pos)
              return (
                <div key={pos} className="grid grid-cols-[1fr_auto_auto_64px] items-center gap-2 px-4 py-2">
                  <span className="text-sm font-semibold"><span className="font-mono text-brand-400">{ordinal(pos)}</span> in group</span>
                  <MiniStep value={r.div} min={1} max={maxPos} onChange={(v) => setRule(pos, { div: v })} />
                  <MiniStep value={r.span} min={1} max={maxPos} onChange={(v) => setRule(pos, { span: v })} />
                  <span className="text-right text-[11px] font-semibold" style={{ color: LEAGUE_COLORS[r.div - 1] ?? '#9aa4b2' }}>{divLabel(r)}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="glass overflow-hidden rounded-3xl">
          <div className="px-4 py-3 text-sm font-bold">Preview · {maxDiv} division{maxDiv === 1 ? '' : 's'}</div>
          <div className="divide-hair">
            {preview.map((d, i) => (
              <div key={i} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: d.color, boxShadow: `0 0 10px ${d.color}` }} />
                  <span className="text-sm font-bold">{d.name}</span>
                  <span className="rounded-md bg-white/8 px-1.5 text-xs font-semibold text-ink-400">{d.players.length}</span>
                </div>
                <div className="mt-1 truncate text-[11px] text-ink-500">{d.players.map((p) => p.name).join(', ')}</div>
              </div>
            ))}
            {preview.length === 0 && <div className="px-4 py-6 text-center text-sm text-ink-500">Enter qualifier results first.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── season view (live / qualifying / final) ─────────────────────────

function SeasonView({ store, detail, loading, readOnly, canStartNext, prevRecords, prevTiers, onSelect, onChanged, onBack, onStartNext, onReopen, onFormDivisions }: {
  store: Store; detail: EventDetail; loading: boolean; readOnly: boolean; canStartNext: boolean; prevRecords?: Map<string, WL> | null; prevTiers?: Map<string, number> | null; onSelect: (id: string) => void; onChanged: () => void; onBack: () => void; onStartNext: () => void; onReopen: () => void; onFormDivisions: () => void
}) {
  const [matches, setMatches] = useState<Match[]>(detail.matches)
  const [validated, setValidated] = useState<Record<string, string | null>>(() => Object.fromEntries(detail.leagues.map((l) => [l.id, l.validatedAt])))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)

  const isQualifying = detail.event.status === 'qualifying'
  const leagues = detail.leagues
  const totalFx = leagues.reduce((s, l) => s + fixtures(l).length, 0)
  const playedFx = leagues.reduce((s, l) => s + fixtures(l).filter((f) => findMatch(matches, f[0].id, f[1].id)).length, 0)
  const pct = totalFx ? Math.round((playedFx / totalFx) * 100) : 0
  const openGroups = leagues.filter((l) => validated[l.id] == null).length

  const applyResult = (res: MatchOpResult) => setMatches((ms) => {
    let next = ms
    if (res.removedId) next = next.filter((m) => m.id !== res.removedId)
    if (res.match) next = [...next.filter((m) => m.id !== res.match!.id), res.match]
    return next
  })
  const doValidate = async (leagueId: string, on: boolean) => {
    setValidated((v) => ({ ...v, [leagueId]: on ? new Date().toISOString() : null }))
    try { await store.validateLeague(leagueId, on) } catch { setValidated((v) => ({ ...v, [leagueId]: on ? null : new Date().toISOString() })) }
  }

  const active = activeId ? leagues.find((l) => l.id === activeId) ?? null : null
  if (active) {
    const idx = leagues.findIndex((l) => l.id === active.id)
    return (
      <GroupSheet
        key={active.id}
        league={active}
        matches={matches}
        readOnly={readOnly}
        locked={validated[active.id] != null}
        store={store}
        eventId={detail.event.id}
        index={idx + 1}
        total={leagues.length}
        prevRecords={prevRecords}
        onMatchOp={applyResult}
        onValidate={(on) => doValidate(active.id, on)}
        onClose={() => setActiveId(null)}
        onPrev={idx > 0 ? () => setActiveId(leagues[idx - 1].id) : undefined}
        onNext={idx < leagues.length - 1 ? () => setActiveId(leagues[idx + 1].id) : undefined}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onBack} className="glass-soft tap flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-ink-300 hover:text-white" title="Back to all leagues">← Leagues</button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {readOnly ? <span className="h-2 w-2 rounded-full bg-ink-500" /> : <span className="h-2 w-2 rounded-full bg-win pulse-dot" />}
              <span className="truncate text-lg font-extrabold">{detail.event.name}</span>
              <span className="rounded-lg bg-white/8 px-2 py-0.5 text-[11px] font-bold uppercase text-ink-300">{isQualifying ? 'Qualifier' : `Season ${detail.event.season}`}</span>
              <StatusPill status={detail.event.status} />
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-500">
              <span>{detail.event.participantIds.length} players · {leagues.length} {isQualifying ? 'groups' : 'divisions'}</span>
              <span className="h-1 w-20 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: readOnly ? '#9aa4b2' : '#34d399' }} /></span>
              <span>{playedFx}/{totalFx}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {readOnly ? (
            canStartNext && (
              <>
                <button onClick={onReopen} className="glass-soft tap rounded-xl px-3 py-2 text-xs font-semibold text-ink-300 hover:text-white" title="Reopen this season to correct results — allowed until the next season starts">↺ Reopen</button>
                <button onClick={onStartNext} className="tap rounded-xl bg-gradient-to-br from-brand to-brand2 px-3.5 py-2 text-xs font-bold text-white glow-brand">⚡ Start Season {detail.event.season + 1}</button>
              </>
            )
          ) : isQualifying ? (
            <>
              <button onClick={async () => { await deleteEvent(detail.event.id); await store.refresh(); onBack() }} className="glass-soft tap rounded-xl px-3 py-2 text-xs font-semibold text-ink-500 hover:text-loss">Discard</button>
              <button onClick={onFormDivisions} className="tap rounded-xl bg-gradient-to-br from-brand to-brand2 px-3.5 py-2 text-xs font-bold text-white glow-brand">Form divisions →</button>
            </>
          ) : (
            <>
              <button onClick={async () => { await deleteEvent(detail.event.id); await store.refresh(); onBack() }} className="glass-soft tap rounded-xl px-3 py-2 text-xs font-semibold text-ink-500 hover:text-loss">Discard</button>
              <button onClick={() => setConfirmFinish(true)} className="tap rounded-xl bg-gradient-to-br from-brand to-brand2 px-3.5 py-2 text-xs font-bold text-white glow-brand">✓ Finish</button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {leagues.map((l) => (
          <LeagueCard
            key={l.id}
            league={l}
            matches={matches}
            readOnly={readOnly}
            locked={validated[l.id] != null}
            isGroup={isQualifying}
            prevRecords={prevRecords}
            prevTiers={prevTiers}
            onSelect={onSelect}
            onOpen={() => setActiveId(l.id)}
          />
        ))}
      </div>

      {loading && <div className="text-center text-xs text-ink-500">syncing…</div>}

      {confirmFinish && (
        <Modal onClose={() => setConfirmFinish(false)}>
          <div className="px-5 py-5">
            <h3 className="text-lg font-bold">Finish this season?</h3>
            <p className="mt-1 text-sm text-ink-500">
              Ratings are saved after each match. Finishing computes promotions — the winner of each division goes up, the last goes down — and proposes the next season.
              {openGroups > 0 && <span className="mt-2 block font-semibold text-brand-400">{openGroups} group{openGroups === 1 ? '' : 's'} not validated yet. Validate them as part of finishing, or finish anyway.</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 border-t hairline px-5 py-4">
            <button onClick={() => setConfirmFinish(false)} className="glass-soft tap flex-1 rounded-xl py-2.5 text-sm font-semibold text-ink-300">Keep open</button>
            {openGroups > 0 && (
              <button onClick={async () => { await finishEvent(detail.event.id); await store.refresh(); setConfirmFinish(false); onChanged() }} className="glass-soft tap flex-1 rounded-xl py-2.5 text-sm font-semibold text-ink-300">Finish anyway</button>
            )}
            <button
              onClick={async () => {
                await Promise.all(leagues.filter((l) => validated[l.id] == null).map((l) => store.validateLeague(l.id, true)))
                await finishEvent(detail.event.id)
                await store.refresh()
                setConfirmFinish(false)
                onChanged()
              }}
              className="tap flex-1 rounded-xl bg-gradient-to-br from-brand to-brand2 py-2.5 text-sm font-bold text-white glow-brand"
            >
              {openGroups > 0 ? 'Validate all & finish' : 'Finish season'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function LeagueCard({ league, matches, readOnly, locked, isGroup, prevRecords, prevTiers, onSelect, onOpen }: {
  league: LeagueWithPlayers; matches: Match[]; readOnly: boolean; locked: boolean; isGroup: boolean; prevRecords?: Map<string, WL> | null; prevTiers?: Map<string, number> | null; onSelect: (id: string) => void; onOpen: () => void
}) {
  const fx = fixtures(league)
  const played = fx.filter((f) => findMatch(matches, f[0].id, f[1].id)).length
  const standings = computeStandings(league, matches)
  const [explainId, setExplainId] = useState<string | null>(null)

  return (
    <div className="glass overflow-hidden rounded-3xl lift">
      <div className="flex items-center justify-between px-4 py-3" style={{ background: `linear-gradient(90deg, ${league.color}26, transparent)` }}>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: league.color, boxShadow: `0 0 12px ${league.color}` }} />
          <span className="font-bold">{league.name}</span>
          <span className="text-[11px] text-ink-500">{league.format}</span>
          {locked && <span className="rounded bg-win/15 px-1.5 py-px text-[9px] font-bold uppercase text-win">✓ locked</span>}
        </div>
        <span className="text-xs font-semibold text-ink-500">{played}/{fx.length}</span>
      </div>

      <div className="px-2 py-1">
        <div className="grid grid-cols-[20px_1fr_auto_22px] gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
          <span></span><span>Player</span><span className="pr-1 text-right">W–L</span><span></span>
        </div>
        {standings.map((s, i) => (
          <div key={s.player.id} className="grid grid-cols-[20px_1fr_auto_22px] items-center gap-1 rounded-xl px-2 text-sm hover:bg-white/5">
            <span className="text-center text-xs font-bold text-ink-500">{i + 1}</span>
            <button onClick={() => onSelect(s.player.id)} className="tap flex min-w-0 items-center gap-2 py-1.5 text-left">
              <Avatar name={s.player.name} size={22} />
              <span className="min-w-0 leading-tight">
                <span className="flex items-center gap-1 truncate font-semibold">{s.player.name} <TieChip reason={s.reason} /></span>
                {prevRecords && (
                  <span className="flex items-center gap-1 text-[10px] text-ink-500">
                    <MovementChip tier={league.tier} prevTier={prevTiers?.get(s.player.id)} known={!!prevTiers} />
                    last: {prevRecords.has(s.player.id) ? `${prevRecords.get(s.player.id)!.wins}-${prevRecords.get(s.player.id)!.losses}` : 'new'}
                  </span>
                )}
              </span>
            </button>
            <span className="pr-1 text-right font-mono text-xs"><span className="text-win">{s.wins}</span><span className="text-ink-600">–</span><span className="text-loss">{s.played - s.wins}</span></span>
            <button onClick={() => setExplainId(s.player.id)} title="Why this rank?" className="tap grid h-6 w-6 place-items-center rounded-lg text-ink-600 hover:bg-white/10 hover:text-white">ⓘ</button>
          </div>
        ))}
      </div>

      <div className="border-t hairline p-2">
        <button onClick={onOpen} className="tap flex w-full items-center justify-center gap-2 rounded-xl bg-white/[0.06] py-2.5 text-xs font-bold text-ink-200 hover:bg-white/10">
          {readOnly ? `View ${isGroup ? 'group' : 'results'}` : played < fx.length ? `Enter results · ${played}/${fx.length}` : 'Review results'} →
        </button>
      </div>

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

/** Auto-suggest a per-group handicap: oversized groups start ahead by (size − smallest). */
function applyHandicaps(divs: DraftDivision[]): DraftDivision[] {
  const sizes = divs.map((d) => d.players.length).filter((n) => n > 0)
  if (!sizes.length) return divs
  const min = Math.min(...sizes)
  return divs.map((d) => ({ ...d, startScore: Math.max(0, d.players.length - min) }))
}

/** Drag-to-reorder seed list (1 = strongest), search-assisted. Feeds snake/pots/block. */
function SeedListModal({ order, onChange, onClose }: { order: Player[]; onChange: (o: Player[]) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()
  return (
    <Modal onClose={onClose} wide>
      <div className="px-5 pb-2 pt-5">
        <h3 className="text-lg font-bold">Seed order</h3>
        <p className="mt-0.5 text-xs text-ink-500">Drag to reorder — 1 = strongest. Snake, pots, and by-rating seeding use this order.</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a player…" className="mt-3 w-full rounded-xl bg-white/5 px-3.5 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-brand/60" />
      </div>
      <Reorder.Group axis="y" values={order} onReorder={onChange} className="max-h-[55vh] space-y-1 overflow-y-auto px-3 pb-3">
        {order.map((p, i) => {
          const dim = !!ql && !`${p.name} ${p.handle}`.toLowerCase().includes(ql)
          return (
            <Reorder.Item key={p.id} value={p} style={{ opacity: dim ? 0.3 : 1 }} className="flex cursor-grab items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 ring-1 ring-white/8 active:cursor-grabbing">
              <span className="w-5 text-center font-mono text-xs font-bold text-ink-500">{i + 1}</span>
              <span className="text-ink-600">⋮⋮</span>
              <Avatar name={p.name} size={24} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
              <SkillBadge elo={p.elo} size="sm" />
            </Reorder.Item>
          )
        })}
      </Reorder.Group>
      <div className="border-t hairline px-5 py-4">
        <button onClick={onClose} className="tap w-full rounded-xl bg-gradient-to-br from-brand to-brand2 py-2.5 text-sm font-bold text-white glow-brand">Done</button>
      </div>
    </Modal>
  )
}

function MovementChip({ tier, prevTier, known }: { tier: number; prevTier?: number; known: boolean }) {
  if (!known) return null
  if (prevTier == null) return <span className="font-bold text-brand-400">●</span> // new to the league this season
  if (prevTier > tier) return <span className="font-bold text-win" title={`Promoted from division ${prevTier}`}>▲</span>
  if (prevTier < tier) return <span className="font-bold text-loss" title={`Relegated from division ${prevTier}`}>▼</span>
  return <span className="text-ink-600" title="Stayed">–</span>
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

function computeStandings(league: LeagueWithPlayers, matches: Match[]): RankedPlayer[] {
  return rankDivision(league.players, matches, { multiSet: parseFormat(league.format).sets > 1 })
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
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

function FormatControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { sets, pointsTo } = parseFormat(value)
  const build = (s: number, p: number) => (s === 1 ? `1 set to ${p}` : `Best of ${s} to ${p}`)
  return (
    <div className="glass-soft flex items-center gap-2 rounded-xl px-2.5 py-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Format</span>
      <Seg value={String(sets)} onChange={(v) => onChange(build(+v, pointsTo))} options={[['1', 'Single'], ['3', 'Bo3'], ['5', 'Bo5']]} />
      <Seg value={String(pointsTo)} onChange={(v) => onChange(build(sets, +v))} options={[['11', '11'], ['21', '21']]} />
    </div>
  )
}

function MiniStep({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(clamp(value - 1))} className="tap grid h-6 w-6 place-items-center rounded-lg bg-white/8 font-bold text-ink-400 hover:text-white">−</button>
      <span className="w-4 text-center font-mono text-sm font-bold tabular-nums">{value}</span>
      <button onClick={() => onChange(clamp(value + 1))} className="tap grid h-6 w-6 place-items-center rounded-lg bg-white/8 font-bold text-ink-400 hover:text-white">+</button>
    </div>
  )
}

function PromoteControl({ cfg, onChange, divisions }: { cfg: PromotionConfig; onChange: (c: PromotionConfig) => void; divisions?: { name: string; color: string }[] }) {
  const [open, setOpen] = useState(false)
  const setOverride = (i: number, key: 'up' | 'down', val: number) => {
    const ov = { ...(cfg.overrides ?? {}) }
    ov[i] = { ...ov[i], [key]: val }
    onChange({ ...cfg, overrides: ov })
  }
  const clearOverride = (i: number) => {
    const ov = { ...(cfg.overrides ?? {}) }
    delete ov[i]
    onChange({ ...cfg, overrides: Object.keys(ov).length ? ov : undefined })
  }
  const ovCount = cfg.overrides ? Object.keys(cfg.overrides).length : 0
  return (
    <div className="relative">
      <div className="glass-soft flex items-center gap-2.5 rounded-xl px-3 py-1.5" title="How many move up / down per division boundary">
        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-win">↑ Up</span>
        <MiniStep value={cfg.up} min={0} max={4} onChange={(v) => onChange({ ...cfg, up: v })} />
        <span className="h-4 w-px bg-white/10" />
        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-loss">↓ Down</span>
        <MiniStep value={cfg.down} min={0} max={4} onChange={(v) => onChange({ ...cfg, down: v })} />
        {divisions && divisions.length > 0 && (
          <>
            <span className="h-4 w-px bg-white/10" />
            <button onClick={() => setOpen((o) => !o)} className={`tap rounded-lg px-1.5 text-xs font-bold ${ovCount ? 'text-brand-400' : 'text-ink-400 hover:text-white'}`} title="Per-division overrides">⚙{ovCount ? ` ${ovCount}` : ''}</button>
          </>
        )}
      </div>
      {open && divisions && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-2xl bg-ink-900/95 p-3 ring-1 ring-white/12 backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Per-division rule</span>
            <button onClick={() => setOpen(false)} className="text-ink-500 hover:text-white">✕</button>
          </div>
          <div className="space-y-1.5">
            {divisions.map((d, i) => {
              const ov = cfg.overrides?.[i]
              const up = ov?.up ?? cfg.up
              const down = ov?.down ?? cfg.down
              const isTop = i === 0, isBot = i === divisions.length - 1
              return (
                <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-2.5 py-1.5">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
                    <span className="truncate">{d.name}</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-win">↑</span>
                    {isTop ? <span className="w-12 text-center text-[10px] text-ink-600">—</span> : <MiniStep value={up} min={0} max={4} onChange={(v) => setOverride(i, 'up', v)} />}
                    <span className="text-[10px] font-bold text-loss">↓</span>
                    {isBot ? <span className="w-12 text-center text-[10px] text-ink-600">—</span> : <MiniStep value={down} min={0} max={4} onChange={(v) => setOverride(i, 'down', v)} />}
                    <button onClick={() => clearOverride(i)} title="Reset to global" className={`text-[10px] ${ov ? 'text-ink-400 hover:text-white' : 'text-transparent'}`}>↺</button>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[10px] text-ink-500">Defaults to the global rule. Top can't promote out; bottom can't relegate out.</p>
        </div>
      )}
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
