import { useMemo, useState } from 'react'
import type { Division, Player } from '../types'
import { Avatar, Badge, FormDots, Sparkline } from './bits'
import { SkillBadge } from './SkillBadge'
import { winRate } from '../lib/format'

export function Leaderboard({
  players,
  divisions,
  onSelect,
}: {
  players: Player[]
  divisions: Division[]
  onSelect: (id: string) => void
}) {
  const [divFilter, setDivFilter] = useState<string>('all')
  const [query, setQuery] = useState('')

  const ranked = useMemo(() => {
    return [...players]
      .sort((a, b) => b.elo - a.elo)
      .filter((p) => divFilter === 'all' || p.divisionId === divFilter)
      .filter(
        (p) =>
          query.trim() === '' ||
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.handle.toLowerCase().includes(query.toLowerCase()),
      )
  }, [players, divFilter, query])

  const divById = useMemo(
    () => Object.fromEntries(divisions.map((d) => [d.id, d])),
    [divisions],
  )

  // global rank index (independent of filter)
  const globalRank = useMemo(() => {
    const sorted = [...players].sort((a, b) => b.elo - a.elo)
    return Object.fromEntries(sorted.map((p, i) => [p.id, i + 1]))
  }, [players])

  if (players.length === 0) return <EmptyState />

  return (
    <div className="animate-fade">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg bg-ink-800 px-3 py-2 ring-1 ring-ink-600">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-500"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          <Chip active={divFilter === 'all'} onClick={() => setDivFilter('all')}>
            All
          </Chip>
          {divisions.map((d) => (
            <Chip
              key={d.id}
              active={divFilter === d.id}
              onClick={() => setDivFilter(d.id)}
              color={d.color}
            >
              {d.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl ring-1 ring-ink-700">
        {/* header */}
        <div className="hidden grid-cols-[44px_1fr_120px_70px_84px_120px] items-center gap-3 bg-ink-850 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500 md:grid">
          <span className="text-center">#</span>
          <span>Player</span>
          <span>Division</span>
          <span className="text-right">ELO</span>
          <span className="text-center">W-L</span>
          <span className="text-right">Trend</span>
        </div>
        <div className="divide-y divide-ink-800">
          {ranked.map((p) => {
            const d = divById[p.divisionId]
            const rank = globalRank[p.id]
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="grid w-full grid-cols-[36px_1fr_auto] items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-ink-800 md:grid-cols-[44px_1fr_120px_70px_84px_120px] md:px-4 md:py-3"
              >
                <span className="text-center">
                  <RankPill rank={rank} />
                </span>
                <div className="flex min-w-0 items-center gap-3">
                  <SkillBadge elo={p.elo} />
                  <Avatar name={p.name} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate font-semibold">
                      <span className="truncate">{p.name}</span>
                      <span className="text-xs">{p.country}</span>
                    </div>
                    <div className="truncate text-xs text-ink-500">@{p.handle}</div>
                  </div>
                </div>
                <div className="hidden md:block">
                  {d && <Badge color={d.color}>{d.name}</Badge>}
                </div>
                <div className="hidden text-right font-mono font-bold text-white md:block">
                  {p.elo}
                </div>
                <div className="hidden text-center text-sm md:block">
                  <span className="text-win">{p.wins}</span>
                  <span className="text-ink-500">-</span>
                  <span className="text-loss">{p.losses}</span>
                  <div className="text-[11px] text-ink-500">{winRate(p.wins, p.losses)}%</div>
                </div>
                <div className="hidden items-center justify-end gap-2 md:flex">
                  <FormDots form={p.form} />
                  <Sparkline data={p.history.slice(-12)} color={d?.color ?? '#ff5500'} width={70} height={28} />
                </div>

                {/* compact right side on mobile */}
                <div className="text-right md:hidden">
                  <div className="font-mono font-bold text-white">{p.elo}</div>
                  <div className="text-[11px] text-ink-500">
                    <span className="text-win">{p.wins}</span>-
                    <span className="text-loss">{p.losses}</span>
                  </div>
                </div>
              </button>
            )
          })}
          {ranked.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-ink-500">No players match.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function RankPill({ rank }: { rank: number }) {
  const top = rank <= 3
  const colors = ['#ffd24a', '#cdd3dd', '#e08a4b']
  return (
    <span
      className="inline-grid h-6 w-6 place-items-center rounded-md text-xs font-bold tabular-nums"
      style={
        top
          ? { background: `${colors[rank - 1]}22`, color: colors[rank - 1], boxShadow: `inset 0 0 0 1px ${colors[rank - 1]}55` }
          : { color: '#7c8696' }
      }
    >
      {rank}
    </span>
  )
}

function Chip({
  children,
  active,
  onClick,
  color = '#ff5500',
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      className="whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
      style={
        active
          ? { background: `${color}22`, color, boxShadow: `inset 0 0 0 1px ${color}66` }
          : { background: '#13171e', color: '#8a93a3' }
      }
    >
      {children}
    </button>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-ink-500">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function EmptyState() {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-ink-600 py-20 text-center">
      <div className="text-4xl">🏓</div>
      <div className="mt-3 text-lg font-semibold">No data yet</div>
      <div className="mt-1 max-w-sm text-sm text-ink-500">
        You cleared all data. Use <span className="font-semibold text-brand">Load mock data</span> in
        the top bar to repopulate the leaderboard.
      </div>
    </div>
  )
}
