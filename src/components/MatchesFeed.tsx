import { useMemo } from 'react'
import type { Division, Match, Player } from '../types'
import { Avatar } from './bits'
import { timeAgo } from '../lib/format'

export function MatchesFeed({
  matches,
  players,
  divisions,
  onSelect,
  onRecord,
}: {
  matches: Match[]
  players: Player[]
  divisions: Division[]
  onSelect: (id: string) => void
  onRecord: () => void
}) {
  const pById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players])
  const dById = useMemo(() => Object.fromEntries(divisions.map((d) => [d.id, d])), [divisions])

  return (
    <div className="animate-fade">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
          Recent matches · {matches.length}
        </h2>
        <button
          onClick={onRecord}
          disabled={players.length < 2}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-bold text-ink-900 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Record match
        </button>
      </div>
      <div className="space-y-2">
        {matches.map((m) => {
          const w = pById[m.winnerId]
          const loserId = m.playerAId === m.winnerId ? m.playerBId : m.playerAId
          const l = pById[loserId]
          const d = dById[m.divisionId]
          if (!w || !l) return null
          const wScore = m.winnerId === m.playerAId ? m.scoreA : m.scoreB
          const lScore = m.winnerId === m.playerAId ? m.scoreB : m.scoreA
          return (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-xl bg-ink-850 px-3 py-2.5 ring-1 ring-ink-800 md:px-4"
            >
              <div className="hidden w-24 shrink-0 flex-col gap-0.5 md:flex">
                {d && (
                  <span className="text-xs font-semibold" style={{ color: d.color }}>
                    {d.name}
                  </span>
                )}
                <span className="text-[11px] text-ink-500">{m.format}</span>
              </div>

              <button
                onClick={() => onSelect(w.id)}
                className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{w.name}</div>
                  <div className="text-[11px] font-semibold text-win">+{m.eloDeltaWinner}</div>
                </div>
                <Avatar name={w.name} size={30} />
              </button>

              <div className="flex shrink-0 items-center gap-1 font-mono text-base font-extrabold">
                <span className="text-white">{wScore}</span>
                <span className="text-ink-600">:</span>
                <span className="text-ink-500">{lScore}</span>
              </div>

              <button
                onClick={() => onSelect(l.id)}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <Avatar name={l.name} size={30} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink-500">{l.name}</div>
                  <div className="text-[11px] font-semibold text-loss">{m.eloDeltaLoser}</div>
                </div>
              </button>

              <span className="hidden w-14 shrink-0 text-right text-[11px] text-ink-500 sm:block">
                {timeAgo(m.playedAt)}
              </span>
            </div>
          )
        })}
        {matches.length === 0 && (
          <div className="rounded-xl border border-dashed border-ink-700 py-16 text-center text-sm text-ink-500">
            No matches recorded yet.
          </div>
        )}
      </div>
    </div>
  )
}
