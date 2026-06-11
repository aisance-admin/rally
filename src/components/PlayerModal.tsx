import { useMemo } from 'react'
import type { Division, Match, Player } from '../types'
import { Avatar, Sparkline } from './bits'
import { SkillBadge } from './SkillBadge'
import { skillFromElo } from '../lib/elo'
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

  return (
    <Modal onClose={onClose} wide>
      <div
        className="relative px-5 pb-5 pt-6"
        style={{ background: `linear-gradient(160deg, ${div?.color ?? '#ff5500'}22, transparent 60%)` }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg bg-ink-800 text-ink-500 hover:text-white"
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

      <div className="grid grid-cols-2 gap-px bg-ink-800 sm:grid-cols-4">
        <Stat label="Global rank" value={`#${rank}`} />
        <Stat label="ELO" value={String(player.elo)} sub={`peak ${player.peakElo}`} />
        <Stat label="Win rate" value={`${winRate(player.wins, player.losses)}%`} sub={`${player.wins}W ${player.losses}L`} />
        <Stat label="Division" value={div?.name ?? '—'} color={div?.color} />
      </div>

      <div className="px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Rating history
          </span>
          <span className="text-xs text-ink-500">last {Math.min(player.history.length, 20)} updates</span>
        </div>
        <div className="rounded-xl bg-ink-850 p-3 ring-1 ring-ink-800">
          <Sparkline data={player.history.slice(-20)} color={div?.color ?? '#ff5500'} width={520} height={90} />
        </div>
      </div>

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
                className="flex w-full items-center gap-3 rounded-lg bg-ink-850 px-3 py-2 text-left ring-1 ring-ink-800 hover:bg-ink-800"
              >
                <span
                  className="grid h-6 w-6 place-items-center rounded text-xs font-bold"
                  style={{
                    background: won ? '#32d74b22' : '#ff453a22',
                    color: won ? '#32d74b' : '#ff453a',
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
                  style={{ color: won ? '#32d74b' : '#ff453a' }}
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
    <div className="bg-ink-850 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="text-lg font-extrabold" style={{ color: color ?? '#fff' }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-ink-500">{sub}</div>}
    </div>
  )
}
