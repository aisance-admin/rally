import { useEffect, useMemo, useState } from 'react'
import type { Division, Match, Player } from '../types'
import { Avatar, Sparkline } from './bits'
import { SkillBadge } from './SkillBadge'
import { skillFromElo } from '../lib/elo'
import { fetchPlayerSeasons, type PlayerSeason } from '../lib/events'
import { timeAgo, winRate } from '../lib/format'
import { Modal } from './Modal'

export function PlayerModal({
  player,
  players,
  divisions,
  matches,
  onClose,
  onSelect,
}: {
  player: Player
  players: Player[]
  divisions: Division[]
  matches: Match[]
  onClose: () => void
  onSelect: (id: string) => void
}) {
  const div = divisions.find((d) => d.id === player.divisionId)
  const skill = skillFromElo(player.elo)
  const pById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players])
  const rank =
    [...players].sort((a, b) => b.elo - a.elo).findIndex((p) => p.id === player.id) + 1

  const playerMatches = useMemo(
    () =>
      matches
        .filter((m) => m.playerAId === player.id || m.playerBId === player.id)
        .slice(0, 8),
    [matches, player.id],
  )

  const [seasons, setSeasons] = useState<PlayerSeason[]>([])
  useEffect(() => {
    let on = true
    fetchPlayerSeasons(player.id).then((s) => on && setSeasons(s)).catch(() => {})
    return () => { on = false }
  }, [player.id])
  const bySeries = useMemo(() => {
    const m = new Map<string, PlayerSeason[]>()
    for (const s of seasons) { const a = m.get(s.seriesId) ?? []; a.push(s); m.set(s.seriesId, a) }
    return [...m.values()]
  }, [seasons])

  return (
    <Modal onClose={onClose} wide>
      <div
        className="relative px-5 pb-5 pt-6"
        style={{ background: `linear-gradient(160deg, ${div?.color ?? '#ff5500'}22, transparent 60%)` }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-ink-200 hover:bg-white/20 hover:text-white"
        >
          ✕
        </button>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar name={player.name} size={64} />
            <div className="absolute -bottom-2 -right-2">
              <SkillBadge elo={player.elo} size="lg" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-xl font-extrabold">
              {player.name} <span>{player.country}</span>
            </div>
            <div className="text-sm text-ink-500">@{player.handle}</div>
            <div className="mt-1 text-xs font-semibold" style={{ color: skill.color }}>
              Level {skill.level} · {skill.label}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/8 sm:grid-cols-4">
        <Stat label="Global rank" value={`#${rank}`} />
        <Stat label="Rating" value={String(player.elo)} />
        <Stat label="Win rate" value={`${winRate(player.wins, player.losses)}%`} sub={`${player.wins}W ${player.losses}L`} />
        <Stat label="Peak" value={String(player.peakElo)} color={skill.color} />
      </div>

      <div className="px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Rating history
          </span>
          <span className="text-xs text-ink-500">last {Math.min(player.history.length, 20)} updates</span>
        </div>
        <div className="rounded-xl bg-white/[0.05] p-3 ring-1 ring-white/10">
          <Sparkline data={player.history.slice(-20)} color={div?.color ?? '#ff5500'} width={520} height={90} />
        </div>
      </div>

      {bySeries.length > 0 && (
        <div className="px-5 pb-2">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Divisions by season</div>
          <div className="space-y-2">
            {bySeries.map((arr) => (
              <div key={arr[0].seriesId} className="rounded-xl bg-white/[0.05] p-2.5 ring-1 ring-white/10">
                <div className="mb-1.5 text-[11px] font-semibold text-ink-400">{arr[0].seriesName}</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {arr.map((s, i) => {
                    const prev = i > 0 ? arr[i - 1] : null
                    const mv = prev ? (prev.tier > s.tier ? '▲' : prev.tier < s.tier ? '▼' : '–') : null
                    const mvColor = mv === '▲' ? '#34d399' : mv === '▼' ? '#fb6f7d' : '#7c8696'
                    return (
                      <span key={`${s.season}:${s.divisionName}`} className="flex items-center gap-1.5">
                        {mv && <span className="text-[11px] font-bold" style={{ color: mvColor }}>{mv}</span>}
                        <span className="rounded-lg px-2 py-1 text-[11px] font-semibold" style={{ background: `${s.divisionColor}22`, color: s.divisionColor }}>
                          {s.season >= 1 ? `S${s.season}` : 'Q'} · {s.divisionName}
                        </span>
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-5 pb-6">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
          Recent matches
        </div>
        <div className="space-y-1.5">
          {playerMatches.map((m) => {
            const won = m.winnerId === player.id
            const oppId = m.playerAId === player.id ? m.playerBId : m.playerAId
            const opp = pById[oppId]
            const myScore = m.playerAId === player.id ? m.scoreA : m.scoreB
            const oppScore = m.playerAId === player.id ? m.scoreB : m.scoreA
            const delta = won ? m.eloDeltaWinner : m.eloDeltaLoser
            return (
              <button
                key={m.id}
                onClick={() => opp && onSelect(opp.id)}
                className="tap flex w-full items-center gap-3 rounded-xl bg-white/[0.05] px-3 py-2 text-left ring-1 ring-white/10 hover:bg-white/10"
              >
                <span
                  className="grid h-6 w-6 place-items-center rounded text-xs font-bold"
                  style={{
                    background: won ? '#34d39922' : '#fb6f7d22',
                    color: won ? '#34d399' : '#fb6f7d',
                  }}
                >
                  {won ? 'W' : 'L'}
                </span>
                {opp && <Avatar name={opp.name} size={24} />}
                <span className="flex-1 truncate text-sm">{opp?.name ?? 'Unknown'}</span>
                <span className="font-mono text-sm font-bold">
                  {myScore}:{oppScore}
                </span>
                <span
                  className="w-10 text-right font-mono text-xs font-semibold"
                  style={{ color: won ? '#34d399' : '#fb6f7d' }}
                >
                  {delta > 0 ? '+' : ''}
                  {delta}
                </span>
                <span className="hidden w-12 text-right text-[11px] text-ink-500 sm:block">
                  {timeAgo(m.playedAt)}
                </span>
              </button>
            )
          })}
          {playerMatches.length === 0 && (
            <div className="py-6 text-center text-sm text-ink-500">No matches yet.</div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="bg-white/[0.05] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="text-lg font-extrabold" style={{ color: color ?? '#fff' }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-ink-500">{sub}</div>}
    </div>
  )
}
