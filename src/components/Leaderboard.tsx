import { useMemo, useState } from 'react'
import type { Division, Player } from '../types'
import { Avatar, FormDots, Sparkline } from './bits'
import { SkillBadge } from './SkillBadge'
import { skillFromElo } from '../lib/elo'
import { winRate } from '../lib/format'

export function Leaderboard({
  players,
  onSelect,
}: {
  players: Player[]
  divisions?: Division[]
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState('')

  const ranked = useMemo(() => [...players].sort((a, b) => b.elo - a.elo), [players])
  const globalRank = useMemo(
    () => Object.fromEntries(ranked.map((p, i) => [p.id, i + 1])),
    [ranked],
  )
  const max = ranked[0]?.elo ?? 2000
  const min = Math.min(...(ranked.length ? ranked.map((p) => p.elo) : [800]), 800)

  const list = useMemo(
    () =>
      ranked.filter(
        (p) =>
          query.trim() === '' ||
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.handle.toLowerCase().includes(query.toLowerCase()),
      ),
    [ranked, query],
  )

  if (players.length === 0) return <EmptyState />

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 glass rounded-2xl px-4 py-2.5">
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-ink-500"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-ink-500 hover:text-white">✕</button>
        )}
      </div>

      <div className="glass overflow-hidden rounded-3xl">
        <div className="hidden grid-cols-[48px_1fr_150px_84px_120px] items-center gap-3 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500 sm:grid">
          <span className="text-center">#</span>
          <span>Player</span>
          <span>Rating</span>
          <span className="text-center">W · L</span>
          <span className="text-right">Form</span>
        </div>
        <div className="divide-hair stagger">
          {list.map((p) => {
            const rank = globalRank[p.id]
            const skill = skillFromElo(p.elo)
            const pct = Math.max(6, Math.round(((p.elo - min) / Math.max(1, max - min)) * 100))
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="tap grid w-full grid-cols-[40px_1fr_auto] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-white/[0.05] sm:grid-cols-[48px_1fr_150px_84px_120px] sm:px-5"
              >
                <span className="flex justify-center"><RankPill rank={rank} /></span>

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

                {/* rating + bar (desktop) */}
                <div className="hidden sm:block">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-lg font-extrabold tabular-nums text-white">{p.elo}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: skill.color }}>L{skill.level}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${skill.color}, #ffffffcc)` }} />
                  </div>
                </div>

                <div className="hidden text-center text-sm sm:block">
                  <div><span className="text-win">{p.wins}</span><span className="text-ink-600"> · </span><span className="text-loss">{p.losses}</span></div>
                  <div className="text-[11px] text-ink-500">{winRate(p.wins, p.losses)}%</div>
                </div>

                <div className="hidden items-center justify-end gap-2 sm:flex">
                  <FormDots form={p.form} />
                  <Sparkline data={p.history.slice(-12)} color={skill.color} width={64} height={26} />
                </div>

                {/* compact (mobile) */}
                <div className="text-right sm:hidden">
                  <div className="font-mono text-base font-extrabold tabular-nums text-white">{p.elo}</div>
                  <div className="text-[11px] text-ink-500">
                    <span className="text-win">{p.wins}</span>-<span className="text-loss">{p.losses}</span>
                  </div>
                </div>
              </button>
            )
          })}
          {list.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-ink-500">No players match “{query}”.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function RankPill({ rank }: { rank: number }) {
  const top = rank <= 3
  const colors = ['#ffd36a', '#cfd6e3', '#e6975a']
  if (top)
    return (
      <span
        className="grid h-7 w-7 place-items-center rounded-xl text-xs font-extrabold tabular-nums"
        style={{
          color: '#0b0e17',
          background: `linear-gradient(160deg, ${colors[rank - 1]}, ${colors[rank - 1]}bb)`,
          boxShadow: `0 4px 14px -4px ${colors[rank - 1]}aa`,
        }}
      >
        {rank}
      </span>
    )
  return <span className="text-sm font-bold tabular-nums text-ink-500">{rank}</span>
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
    <div className="glass grid place-items-center rounded-3xl py-20 text-center">
      <div className="text-5xl">🏓</div>
      <div className="mt-3 text-lg font-semibold">No players yet</div>
      <div className="mt-1 max-w-sm text-sm text-ink-500">
        Load the sample roster from the top bar, or add players in the <span className="font-semibold text-brand">Roster</span> tab.
      </div>
    </div>
  )
}
