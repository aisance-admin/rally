import { useMemo } from 'react'
import type { Division, Player } from '../types'
import { Avatar, FormDots } from './bits'
import { SkillBadge } from './SkillBadge'

export function Divisions({
  players,
  divisions,
  onSelect,
}: {
  players: Player[]
  divisions: Division[]
  onSelect: (id: string) => void
}) {
  const byDiv = useMemo(() => {
    const map: Record<string, Player[]> = {}
    for (const d of divisions) map[d.id] = []
    for (const p of players) (map[p.divisionId] ??= []).push(p)
    for (const k of Object.keys(map)) map[k].sort((a, b) => b.elo - a.elo)
    return map
  }, [players, divisions])

  if (players.length === 0)
    return <div className="py-20 text-center text-sm text-ink-500">No data. Load mock data to view divisions.</div>

  const sorted = [...divisions].sort((a, b) => a.tier - b.tier)

  return (
    <div className="grid animate-fade gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sorted.map((d) => {
        const pool = byDiv[d.id] ?? []
        return (
          <div key={d.id} className="overflow-hidden rounded-xl bg-ink-850 ring-1 ring-ink-700">
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ background: `linear-gradient(90deg, ${d.color}22, transparent)` }}
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                <span className="font-bold">{d.name}</span>
                <span className="text-xs text-ink-500">· {d.eloFloor}+ ELO</span>
              </div>
              <span className="rounded-md bg-ink-700 px-2 py-0.5 text-xs font-semibold text-ink-500">
                {pool.length} players
              </span>
            </div>
            <div className="divide-y divide-ink-800">
              {pool.map((p, i) => {
                const promote = d.tier > 1 && i === 0
                const relegate = d.tier < divisions.length && i === pool.length - 1 && pool.length > 2
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelect(p.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ink-800"
                  >
                    <span className="w-4 text-center text-xs font-bold text-ink-500">{i + 1}</span>
                    <SkillBadge elo={p.elo} size="sm" />
                    <Avatar name={p.name} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{p.name}</div>
                      <FormDots form={p.form} />
                    </div>
                    {promote && <Zone dir="up" />}
                    {relegate && <Zone dir="down" />}
                    <span className="font-mono text-sm font-bold text-white">{p.elo}</span>
                  </button>
                )
              })}
              {pool.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-ink-500">Empty division</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Zone({ dir }: { dir: 'up' | 'down' }) {
  const up = dir === 'up'
  return (
    <span
      title={up ? 'Promotion spot' : 'Relegation spot'}
      className="grid h-5 w-5 place-items-center rounded text-xs"
      style={{ background: up ? '#32d74b22' : '#ff453a22', color: up ? '#32d74b' : '#ff453a' }}
    >
      {up ? '▲' : '▼'}
    </span>
  )
}
