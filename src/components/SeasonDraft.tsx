import { useEffect, useMemo, useState } from 'react'
import type { EventDetail, Player } from '../types'
import type { Store } from '../lib/store'
import {
  computeNextSeasonDivisions,
  createSeasonFromDivisions,
  type DraftDivision,
  LEAGUE_COLORS,
  LEAGUE_NAMES,
  seasonRecordsFor,
  type WL,
} from '../lib/seasons'
import { Avatar } from './bits'
import { SkillBadge } from './SkillBadge'

export function SeasonDraft({
  store,
  prev,
  onStarted,
  onCancel,
}: {
  store: Store
  prev: EventDetail
  onStarted: (id: string) => void
  onCancel: () => void
}) {
  const seriesName = prev.event.name
  const nextSeason = prev.event.season + 1
  const [promoteN, setPromoteN] = useState(2)
  const [divisions, setDivisions] = useState<DraftDivision[]>([])
  const [busy, setBusy] = useState(false)

  // (Re)compute the default promotion/relegation layout whenever N changes.
  useEffect(() => {
    setDivisions(computeNextSeasonDivisions(prev, promoteN))
  }, [prev, promoteN])

  const byId = useMemo(() => Object.fromEntries(store.players.map((p) => [p.id, p])), [store.players])
  const fresh = (p: Player) => byId[p.id] ?? p
  // Each player's win/loss record from the season we're advancing from.
  const prevRecords = useMemo(() => seasonRecordsFor(prev), [prev])
  const prevSeasonNo = prev.event.season

  const inDraft = useMemo(() => {
    const s = new Set<string>()
    divisions.forEach((d) => d.players.forEach((p) => s.add(p.id)))
    return s
  }, [divisions])

  const bench = useMemo(
    () => store.players.filter((p) => !inDraft.has(p.id)).sort((a, b) => b.elo - a.elo),
    [store.players, inDraft],
  )
  const totalPlaying = divisions.reduce((s, d) => s + d.players.length, 0)

  function move(fromDiv: number, playerId: string, toDiv: number) {
    setDivisions((divs) => {
      const next = divs.map((d) => ({ ...d, players: [...d.players] }))
      const idx = next[fromDiv].players.findIndex((p) => p.id === playerId)
      if (idx < 0) return divs
      const [p] = next[fromDiv].players.splice(idx, 1)
      next[toDiv].players.push(p)
      return next
    })
  }
  function drop(fromDiv: number, playerId: string) {
    setDivisions((divs) =>
      divs.map((d, i) => (i === fromDiv ? { ...d, players: d.players.filter((p) => p.id !== playerId) } : d)),
    )
  }
  function addToDivision(player: Player, toDiv: number) {
    setDivisions((divs) => divs.map((d, i) => (i === toDiv ? { ...d, players: [...d.players, player] } : d)))
  }
  function addDivision() {
    setDivisions((divs) => {
      const i = divs.length
      return [...divs, { name: LEAGUE_NAMES[i] ?? `League ${i + 1}`, color: LEAGUE_COLORS[i] ?? '#9aa4b2', players: [] }]
    })
  }
  function removeDivision(i: number) {
    setDivisions((divs) => {
      if (divs[i].players.length > 0 || divs.length <= 1) return divs
      return divs.filter((_, j) => j !== i)
    })
  }

  async function start() {
    const nonEmpty = divisions.filter((d) => d.players.length > 0)
    if (totalPlaying < 2 || nonEmpty.length === 0) return
    setBusy(true)
    try {
      const id = await createSeasonFromDivisions(seriesName, nextSeason, nonEmpty)
      await store.refresh()
      onStarted(id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="animate-fade space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-850 p-4 ring-1 ring-ink-700">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold">{seriesName}</span>
            <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[11px] font-bold uppercase text-brand-400">Season {nextSeason}</span>
          </div>
          <div className="mt-0.5 text-xs text-ink-500">
            Promotion/relegation from Season {prev.event.season} · {totalPlaying} playing · move with ▲▼, drop with ✕
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-ink-800 px-2 py-1.5 ring-1 ring-ink-700" title="Players promoted/relegated per boundary">
            <span className="text-[11px] uppercase tracking-wide text-ink-500">Up/down</span>
            <button onClick={() => setPromoteN((v) => Math.max(0, v - 1))} className="grid h-6 w-6 place-items-center rounded bg-ink-900 font-bold text-ink-400 hover:text-white">−</button>
            <span className="w-4 text-center font-mono font-bold">{promoteN}</span>
            <button onClick={() => setPromoteN((v) => Math.min(5, v + 1))} className="grid h-6 w-6 place-items-center rounded bg-ink-900 font-bold text-ink-400 hover:text-white">+</button>
          </div>
          <button onClick={onCancel} className="rounded-lg px-3 py-2 text-xs font-semibold text-ink-500 ring-1 ring-ink-700 hover:text-white">Cancel</button>
          <button onClick={start} disabled={busy || totalPlaying < 2} className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-ink-900 hover:bg-brand-400 disabled:opacity-40">
            {busy ? 'Starting…' : `⚡ Start Season ${nextSeason}`}
          </button>
        </div>
      </div>

      <div className="rounded-lg bg-ink-800 px-3 py-2 text-xs text-ink-400">
        Default places players by last season's standings (top {promoteN} of each division move up, bottom {promoteN} move down). Adjust the
        <span className="text-ink-300"> Up/down</span> count to recompute, or move players by hand. The{' '}
        <span className="text-win">W</span><span className="text-ink-500">–</span><span className="text-loss">L</span> shown is each player's{' '}
        <span className="text-ink-300">Season {prevSeasonNo}</span> record; ratings carry over.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {divisions.map((d, i) => (
          <div key={i} className="overflow-hidden rounded-xl bg-ink-850 ring-1 ring-ink-700">
            <div className="flex items-center justify-between px-4 py-3" style={{ background: `linear-gradient(90deg, ${d.color}22, transparent)` }}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                <span className="font-bold">{d.name}</span>
                <span className="text-xs text-ink-500">{d.players.length}</span>
              </div>
              {d.players.length === 0 && divisions.length > 1 && (
                <button onClick={() => removeDivision(i)} className="text-[11px] font-semibold text-ink-500 hover:text-loss">remove</button>
              )}
            </div>
            <div className="divide-y divide-ink-800">
              {d.players.map((raw, pos) => {
                const p = fresh(raw)
                return (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="w-4 text-center text-xs font-bold text-ink-500">{pos + 1}</span>
                    <SkillBadge elo={p.elo} size="sm" />
                    <Avatar name={p.name} size={26} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                    <RecordChip rec={prevRecords.get(p.id)} elo={p.elo} />
                    <div className="flex items-center gap-0.5">
                      <IconBtn label="Move up a division" disabled={i === 0} onClick={() => move(i, p.id, i - 1)}>▲</IconBtn>
                      <IconBtn label="Move down a division" disabled={i === divisions.length - 1} onClick={() => move(i, p.id, i + 1)}>▼</IconBtn>
                      <IconBtn label="Drop from season (left)" onClick={() => drop(i, p.id)} danger>✕</IconBtn>
                    </div>
                  </div>
                )
              })}
              {d.players.length === 0 && <div className="px-4 py-4 text-center text-xs text-ink-500">empty</div>}
            </div>
          </div>
        ))}
      </div>

      <button onClick={addDivision} className="w-full rounded-lg border border-dashed border-ink-600 py-2 text-xs font-semibold text-ink-500 hover:text-white">
        ＋ Add a division
      </button>

      {/* bench — players not playing this season */}
      <div className="overflow-hidden rounded-xl bg-ink-850 ring-1 ring-ink-700">
        <div className="px-4 py-3 text-sm font-bold">
          Not playing this season <span className="text-ink-500">· {bench.length}</span>
          <span className="ml-2 text-[11px] font-normal text-ink-500">(dropped or new — tap a division to add)</span>
        </div>
        {bench.length === 0 ? (
          <div className="px-4 py-4 text-center text-xs text-ink-500">Everyone is placed.</div>
        ) : (
          <div className="divide-y divide-ink-800">
            {bench.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <SkillBadge elo={p.elo} size="sm" />
                <Avatar name={p.name} size={26} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                <RecordChip rec={prevRecords.get(p.id)} elo={p.elo} />
                <div className="flex flex-wrap gap-1">
                  {divisions.map((d, i) => (
                    <button key={i} onClick={() => addToDivision(p, i)} className="rounded px-2 py-1 text-[11px] font-semibold" style={{ background: `${d.color}1f`, color: d.color }}>
                      + {d.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RecordChip({ rec, elo }: { rec?: WL; elo: number }) {
  return (
    <div className="text-right leading-tight" title="Last season W–L · rating">
      {rec ? (
        <div className="font-mono text-xs font-semibold">
          <span className="text-win">{rec.wins}</span>
          <span className="text-ink-600">-</span>
          <span className="text-loss">{rec.losses}</span>
        </div>
      ) : (
        <div className="text-[10px] font-bold uppercase text-brand-400">new</div>
      )}
      <div className="text-[10px] text-ink-500">{elo}</div>
    </div>
  )
}

function IconBtn({
  children,
  onClick,
  disabled,
  danger,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  label: string
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-6 w-6 place-items-center rounded text-[11px] font-bold transition disabled:opacity-20 ${
        danger ? 'text-ink-500 hover:bg-loss/15 hover:text-loss' : 'text-ink-400 hover:bg-ink-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
