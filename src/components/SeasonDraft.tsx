import { useEffect, useMemo, useState } from 'react'
import type { Player } from '../types'
import type { Store } from '../lib/store'
import {
  type CreateSeasonOpts,
  createSeasonFromDivisions,
  type DraftDivision,
  LEAGUE_COLORS,
  LEAGUE_NAMES,
  type WL,
} from '../lib/seasons'
import { Avatar } from './bits'
import { SkillBadge } from './SkillBadge'

const clone = (divs: DraftDivision[]) => divs.map((d) => ({ ...d, players: [...d.players] }))

export function DivisionDraft({
  store,
  seriesId,
  seriesName,
  season,
  initialDivisions,
  prevRecords,
  prevSeasonNo,
  subtitle,
  controls,
  note,
  createOpts,
  startLabel,
  onStarted,
  onCancel,
}: {
  store: Store
  seriesId: string
  seriesName: string
  season: number
  initialDivisions: DraftDivision[]
  prevRecords?: Map<string, WL> | null
  prevSeasonNo?: number | null
  subtitle: string
  controls?: React.ReactNode
  note?: React.ReactNode
  createOpts?: CreateSeasonOpts
  startLabel?: string
  onStarted: (id: string) => void
  onCancel: () => void
}) {
  const [divisions, setDivisions] = useState<DraftDivision[]>(() => clone(initialDivisions))
  const [busy, setBusy] = useState(false)
  const showRecord = !!prevRecords

  // Re-seed when the parent recomputes the layout (reshuffle / promote count).
  useEffect(() => {
    setDivisions(clone(initialDivisions))
  }, [initialDivisions])

  const byId = useMemo(() => Object.fromEntries(store.players.map((p) => [p.id, p])), [store.players])
  const fresh = (p: Player) => byId[p.id] ?? p

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
  const nonEmpty = divisions.filter((d) => d.players.length > 0)
  const tooSmall = nonEmpty.filter((d) => d.players.length < 2)
  const valid = totalPlaying >= 2 && nonEmpty.length >= 1 && tooSmall.length === 0

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
  const drop = (fromDiv: number, playerId: string) =>
    setDivisions((divs) =>
      divs.map((d, i) => (i === fromDiv ? { ...d, players: d.players.filter((p) => p.id !== playerId) } : d)),
    )
  const addToDivision = (player: Player, toDiv: number) =>
    setDivisions((divs) => divs.map((d, i) => (i === toDiv ? { ...d, players: [...d.players, player] } : d)))
  const addDivision = () =>
    setDivisions((divs) => [
      ...divs,
      { name: LEAGUE_NAMES[divs.length] ?? `League ${divs.length + 1}`, color: LEAGUE_COLORS[divs.length] ?? '#9aa4b2', players: [] },
    ])
  const removeDivision = (i: number) =>
    setDivisions((divs) => (divs[i].players.length > 0 || divs.length <= 1 ? divs : divs.filter((_, j) => j !== i)))

  async function start() {
    if (!valid) return
    setBusy(true)
    try {
      const id = await createSeasonFromDivisions(seriesId, seriesName, season, nonEmpty, createOpts)
      await store.refresh()
      onStarted(id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold">{seriesName}</span>
            <span className="rounded-lg bg-brand/15 px-2 py-0.5 text-[11px] font-bold uppercase text-brand-400">Season {season}</span>
          </div>
          <div className="mt-0.5 text-xs text-ink-500">{subtitle} · {totalPlaying} playing</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {controls}
          <button onClick={onCancel} className="glass-soft tap rounded-xl px-3 py-2 text-xs font-semibold text-ink-400 hover:text-white">Cancel</button>
          <button onClick={start} disabled={busy || !valid} className="tap rounded-xl bg-gradient-to-br from-brand to-brand2 px-4 py-2 text-xs font-bold text-white glow-brand disabled:opacity-40 disabled:shadow-none">
            {busy ? 'Starting…' : startLabel ?? `Start Season ${season}`}
          </button>
        </div>
      </div>

      {note && <div className="glass-soft rounded-2xl px-4 py-2.5 text-xs text-ink-400">{note}</div>}
      {tooSmall.length > 0 && (
        <div className="rounded-2xl bg-loss/10 px-4 py-2.5 text-xs font-medium text-loss ring-1 ring-loss/25">
          A division needs at least 2 players — {tooSmall.map((d) => d.name).join(', ')} {tooSmall.length === 1 ? 'has' : 'have'} just one. Move someone in or remove the division.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {divisions.map((d, i) => (
          <div key={i} className="glass overflow-hidden rounded-3xl lift">
            <div className="flex items-center justify-between px-4 py-3" style={{ background: `linear-gradient(90deg, ${d.color}26, transparent)` }}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color, boxShadow: `0 0 12px ${d.color}` }} />
                <span className="font-bold">{d.name}</span>
                <span className="rounded-md bg-white/8 px-1.5 text-xs font-semibold text-ink-400">{d.players.length}</span>
              </div>
              {d.players.length === 0 && divisions.length > 1 && (
                <button onClick={() => removeDivision(i)} className="text-[11px] font-semibold text-ink-500 hover:text-loss">remove</button>
              )}
            </div>
            <div className="divide-hair">
              {d.players.map((raw, pos) => {
                const p = fresh(raw)
                return (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="w-4 text-center text-xs font-bold text-ink-500">{pos + 1}</span>
                    <SkillBadge elo={p.elo} size="sm" />
                    <Avatar name={p.name} size={26} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                    <RecordChip rec={prevRecords?.get(p.id)} elo={p.elo} showRecord={showRecord} />
                    <div className="flex items-center gap-0.5">
                      <IconBtn label="Move up a division" disabled={i === 0} onClick={() => move(i, p.id, i - 1)}>▲</IconBtn>
                      <IconBtn label="Move down a division" disabled={i === divisions.length - 1} onClick={() => move(i, p.id, i + 1)}>▼</IconBtn>
                      <IconBtn label="Sit out this season" onClick={() => drop(i, p.id)} danger>✕</IconBtn>
                    </div>
                  </div>
                )
              })}
              {d.players.length === 0 && <div className="px-4 py-5 text-center text-xs text-ink-500">empty</div>}
            </div>
          </div>
        ))}
      </div>

      <button onClick={addDivision} className="tap w-full rounded-2xl border border-dashed hairline py-2.5 text-xs font-semibold text-ink-500 hover:text-white">
        ＋ Add a division
      </button>

      <div className="glass overflow-hidden rounded-3xl">
        <div className="px-4 py-3 text-sm font-bold">
          Sitting out <span className="text-ink-500">· {bench.length}</span>
          <span className="ml-2 text-[11px] font-normal text-ink-500">tap a division to add them in</span>
        </div>
        {bench.length === 0 ? (
          <div className="px-4 py-5 text-center text-xs text-ink-500">Everyone's placed.</div>
        ) : (
          <div className="divide-hair">
            {bench.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <SkillBadge elo={p.elo} size="sm" />
                <Avatar name={p.name} size={26} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                <RecordChip rec={prevRecords?.get(p.id)} elo={p.elo} showRecord={showRecord} />
                <div className="flex flex-wrap gap-1">
                  {divisions.map((d, i) => (
                    <button key={i} onClick={() => addToDivision(p, i)} className="tap rounded-lg px-2 py-1 text-[11px] font-semibold" style={{ background: `${d.color}22`, color: d.color }}>
                      + {d.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {prevSeasonNo != null && (
        <p className="px-1 text-[11px] text-ink-500">
          <span className="text-win">W</span>–<span className="text-loss">L</span> is each player's Season {prevSeasonNo} record. Ratings carry over.
        </p>
      )}
    </div>
  )
}

function RecordChip({ rec, elo, showRecord }: { rec?: WL; elo: number; showRecord: boolean }) {
  return (
    <div className="text-right leading-tight">
      {showRecord ? (
        rec ? (
          <div className="font-mono text-xs font-semibold">
            <span className="text-win">{rec.wins}</span><span className="text-ink-600">-</span><span className="text-loss">{rec.losses}</span>
          </div>
        ) : (
          <div className="text-[10px] font-bold uppercase text-brand-400">new</div>
        )
      ) : null}
      <div className="font-mono text-[11px] text-ink-500">{elo}</div>
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
      className={`tap grid h-7 w-7 place-items-center rounded-lg text-[11px] font-bold disabled:opacity-20 ${
        danger ? 'text-ink-500 hover:bg-loss/15 hover:text-loss' : 'text-ink-400 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
