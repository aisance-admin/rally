import { useMemo, useState } from 'react'
import type { Player } from '../types'
import { applyElo } from '../lib/elo'
import { Avatar } from './bits'
import { Modal } from './Modal'
import type { RecordMatchInput } from '../lib/store'

const FORMATS = ['1 set to 11', 'Best of 3 to 11', '1 set to 21']

export function RecordMatchModal({
  players,
  onClose,
  onSubmit,
}: {
  players: Player[]
  onClose: () => void
  onSubmit: (input: RecordMatchInput) => void
}) {
  const sorted = useMemo(() => [...players].sort((a, b) => a.name.localeCompare(b.name)), [players])
  const [aId, setAId] = useState(sorted[0]?.id ?? '')
  const [bId, setBId] = useState(sorted[1]?.id ?? '')
  const [aScore, setAScore] = useState(11)
  const [bScore, setBScore] = useState(7)
  const [format, setFormat] = useState(FORMATS[0])

  const a = players.find((p) => p.id === aId)
  const b = players.find((p) => p.id === bId)
  const sameError = aId === bId
  const winnerIsA = aScore > bScore
  const tie = aScore === bScore

  const preview = useMemo(() => {
    if (!a || !b || sameError || tie) return null
    const winner = winnerIsA ? a : b
    const loser = winnerIsA ? b : a
    return applyElo(winner.elo, loser.elo)
  }, [a, b, sameError, tie, winnerIsA])

  function submit() {
    if (!a || !b || sameError || tie) return
    onSubmit({
      winnerId: winnerIsA ? a.id : b.id,
      loserId: winnerIsA ? b.id : a.id,
      winnerScore: Math.max(aScore, bScore),
      loserScore: Math.min(aScore, bScore),
      format,
    })
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between border-b hairline px-5 py-4">
        <h3 className="font-bold">Record match</h3>
        <button onClick={onClose} className="text-ink-500 hover:text-white">
          ✕
        </button>
      </div>

      <div className="space-y-4 px-5 py-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <PlayerPick label="Player A" value={aId} onChange={setAId} players={sorted} player={a} highlight={winnerIsA && !tie} />
          <span className="text-xs font-bold text-ink-500">VS</span>
          <PlayerPick label="Player B" value={bId} onChange={setBId} players={sorted} player={b} highlight={!winnerIsA && !tie} />
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <ScoreInput value={aScore} onChange={setAScore} />
          <span className="text-ink-600">:</span>
          <ScoreInput value={bScore} onChange={setBScore} />
        </div>

        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-500">Format</div>
          <div className="flex gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className="flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition"
                style={
                  format === f
                    ? { background: 'rgba(255,106,61,0.18)', color: '#ff8a5e', boxShadow: 'inset 0 0 0 1.5px rgba(255,106,61,0.6)' }
                    : { background: 'rgba(255,255,255,0.05)', color: '#97a3b8' }
                }
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {sameError && (
          <p className="rounded-lg bg-loss/10 px-3 py-2 text-xs text-loss">Pick two different players.</p>
        )}
        {tie && !sameError && (
          <p className="rounded-lg bg-loss/10 px-3 py-2 text-xs text-loss">Scores can't be tied — there must be a winner.</p>
        )}
        {preview && a && b && (
          <div className="rounded-lg bg-white/8 px-3 py-2.5 text-sm ring-1 ring-white/10">
            <span className="text-ink-500">Rating change: </span>
            <span className="font-semibold text-win">
              {winnerIsA ? a.name : b.name} +{preview.winnerDelta}
            </span>
            <span className="text-ink-500"> · </span>
            <span className="font-semibold text-loss">
              {winnerIsA ? b.name : a.name} {preview.loserDelta}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t hairline px-5 py-4">
        <button onClick={onClose} className="flex-1 rounded-lg bg-white/8 py-2.5 text-sm font-semibold text-ink-500 hover:text-white">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={sameError || tie}
          className="tap flex-1 rounded-xl bg-gradient-to-br from-brand to-brand2 py-2.5 text-sm font-bold text-white glow-brand disabled:opacity-40 disabled:shadow-none"
        >
          Save &amp; update ratings
        </button>
      </div>
    </Modal>
  )
}

function PlayerPick({
  label,
  value,
  onChange,
  players,
  player,
  highlight,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  players: Player[]
  player?: Player
  highlight: boolean
}) {
  return (
    <div
      className="rounded-xl p-3 ring-1 transition"
      style={{
        background: highlight ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
        boxShadow: highlight ? 'inset 0 0 0 1.5px rgba(52,211,153,0.5)' : 'inset 0 0 0 1px rgba(255,255,255,0.08)',
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        {player && <Avatar name={player.name} size={28} />}
        <span className="text-[11px] uppercase tracking-wide text-ink-500">{label}</span>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-white/5 px-2 py-2 text-sm font-semibold outline-none ring-1 ring-white/10"
      >
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.elo})
          </option>
        ))}
      </select>
    </div>
  )
}

function ScoreInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className="grid h-9 w-9 place-items-center rounded-lg bg-white/8 text-lg font-bold text-ink-500 hover:text-white"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-14 rounded-lg bg-white/5 py-2 text-center font-mono text-xl font-extrabold outline-none ring-1 ring-white/10"
      />
      <button
        onClick={() => onChange(value + 1)}
        className="grid h-9 w-9 place-items-center rounded-lg bg-white/8 text-lg font-bold text-ink-500 hover:text-white"
      >
        +
      </button>
    </div>
  )
}
