import { useMemo, useState } from 'react'
import type { Player } from '../types'
import type { Store } from '../lib/store'
import { Avatar } from './bits'
import { SkillBadge } from './SkillBadge'
import { Modal } from './Modal'
import { winRate } from '../lib/format'

export function PlayersAdmin({ store, onSelect }: { store: Store; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Player | null>(null)
  const [adding, setAdding] = useState(false)
  const [bulk, setBulk] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Player | null>(null)
  const [busy, setBusy] = useState(false)

  const list = useMemo(
    () =>
      [...store.players]
        .sort((a, b) => b.elo - a.elo)
        .filter(
          (p) =>
            query.trim() === '' ||
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.handle.toLowerCase().includes(query.toLowerCase()),
        ),
    [store.players, query],
  )

  return (
    <div className="animate-fade">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg bg-ink-800 px-3 py-2 ring-1 ring-ink-600">
          <span className="text-ink-500">🔎</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search roster…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-500"
          />
        </div>
        <button onClick={() => setBulk(true)} className="rounded-lg bg-ink-800 px-3 py-2 text-sm font-semibold text-ink-300 ring-1 ring-ink-700 hover:text-white">
          ⎘ Bulk add
        </button>
        <button onClick={() => setAdding(true)} className="rounded-lg bg-brand px-3 py-2 text-sm font-bold text-ink-900 hover:bg-brand-400">
          + Add player
        </button>
      </div>

      {store.players.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-ink-600 py-16 text-center">
          <div className="text-4xl">🏓</div>
          <div className="mt-3 text-lg font-semibold">No players yet</div>
          <div className="mt-1 max-w-sm text-sm text-ink-500">
            Add players one by one, paste a whole list, or load the sample roster from the top bar.
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setAdding(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-ink-900">
              + Add player
            </button>
            <button onClick={() => setBulk(true)} className="rounded-lg bg-ink-800 px-4 py-2 text-sm font-semibold ring-1 ring-ink-700">
              Bulk add
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-ink-700">
          <div className="divide-y divide-ink-800">
            {list.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-ink-800 md:px-4">
                <SkillBadge elo={p.elo} size="sm" />
                <button onClick={() => onSelect(p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar name={p.name} size={32} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate font-semibold">
                      {p.name} <span className="text-xs">{p.country}</span>
                    </div>
                    <div className="truncate text-xs text-ink-500">
                      @{p.handle} · {p.wins}-{p.losses} · {winRate(p.wins, p.losses)}%
                    </div>
                  </div>
                </button>
                <span className="font-mono text-sm font-bold text-white">{p.elo}</span>
                <button onClick={() => setEditing(p)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-700 hover:text-white" title="Edit">
                  ✎
                </button>
                <button onClick={() => setConfirmDelete(p)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-loss/15 hover:text-loss" title="Delete">
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(adding || editing) && (
        <PlayerForm
          player={editing}
          busy={busy}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
          onSave={async (vals) => {
            setBusy(true)
            try {
              if (editing) await store.updatePlayer(editing.id, vals)
              else await store.createPlayer(vals)
              setAdding(false)
              setEditing(null)
            } finally {
              setBusy(false)
            }
          }}
        />
      )}

      {bulk && (
        <BulkAdd
          busy={busy}
          onClose={() => setBulk(false)}
          onSave={async (names, elo) => {
            setBusy(true)
            try {
              await store.bulkAddPlayers(names, elo)
              setBulk(false)
            } finally {
              setBusy(false)
            }
          }}
        />
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <div className="px-5 py-5">
            <h3 className="text-lg font-bold">Delete {confirmDelete.name}?</h3>
            <p className="mt-1 text-sm text-ink-500">
              This permanently removes the player and their match history.
            </p>
          </div>
          <div className="flex gap-2 border-t border-ink-800 px-5 py-4">
            <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-lg bg-ink-800 py-2.5 text-sm font-semibold text-ink-300">
              Cancel
            </button>
            <button
              onClick={async () => {
                await store.deletePlayer(confirmDelete.id)
                setConfirmDelete(null)
              }}
              className="flex-1 rounded-lg bg-loss py-2.5 text-sm font-bold text-white"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

const FLAGS = ['🏓', '🇷🇺', '🇯🇵', '🇨🇳', '🇩🇪', '🇫🇷', '🇪🇸', '🇸🇪', '🇺🇸', '🇬🇧', '🇮🇳', '🇧🇷', '🇰🇷']

function PlayerForm({
  player,
  busy,
  onClose,
  onSave,
}: {
  player: Player | null
  busy: boolean
  onClose: () => void
  onSave: (vals: { name: string; handle: string; country: string; elo: number }) => void
}) {
  const [name, setName] = useState(player?.name ?? '')
  const [handle, setHandle] = useState(player?.handle ?? '')
  const [country, setCountry] = useState(player?.country ?? '🏓')
  const [elo, setElo] = useState(player?.elo ?? 1000)

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
        <h3 className="font-bold">{player ? 'Edit player' : 'Add player'}</h3>
        <button onClick={onClose} className="text-ink-500 hover:text-white">✕</button>
      </div>
      <div className="space-y-3 px-5 py-5">
        <L label="Name">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700" placeholder="Full name" />
        </L>
        <L label="Handle">
          <input value={handle} onChange={(e) => setHandle(e.target.value)} className="w-full rounded-lg bg-ink-900 px-3 py-2 text-sm outline-none ring-1 ring-ink-700" placeholder="auto from name" />
        </L>
        <div className="grid grid-cols-2 gap-3">
          <L label="Country">
            <div className="flex flex-wrap gap-1">
              {FLAGS.map((f) => (
                <button key={f} onClick={() => setCountry(f)} className="grid h-8 w-8 place-items-center rounded-md text-lg" style={{ background: country === f ? '#ff550033' : '#13171e', boxShadow: country === f ? 'inset 0 0 0 1px #ff5500' : 'none' }}>
                  {f}
                </button>
              ))}
            </div>
          </L>
          <L label={`Starting ELO · ${elo}`}>
            <input type="range" min={700} max={2200} step={10} value={elo} onChange={(e) => setElo(Number(e.target.value))} className="w-full accent-brand" />
            <input type="number" value={elo} onChange={(e) => setElo(Number(e.target.value) || 1000)} className="mt-1 w-full rounded-lg bg-ink-900 px-3 py-1.5 text-center font-mono text-sm font-bold outline-none ring-1 ring-ink-700" />
          </L>
        </div>
      </div>
      <div className="flex gap-2 border-t border-ink-800 px-5 py-4">
        <button onClick={onClose} className="flex-1 rounded-lg bg-ink-800 py-2.5 text-sm font-semibold text-ink-300">Cancel</button>
        <button
          disabled={busy || !name.trim()}
          onClick={() => onSave({ name: name.trim(), handle: handle.trim(), country, elo })}
          className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-bold text-ink-900 disabled:opacity-40"
        >
          {busy ? 'Saving…' : player ? 'Save changes' : 'Add player'}
        </button>
      </div>
    </Modal>
  )
}

function BulkAdd({
  busy,
  onClose,
  onSave,
}: {
  busy: boolean
  onClose: () => void
  onSave: (names: string[], elo: number) => void
}) {
  const [text, setText] = useState('')
  const [elo, setElo] = useState(1000)
  const names = text.split('\n').map((s) => s.trim()).filter(Boolean)

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
        <h3 className="font-bold">Bulk add players</h3>
        <button onClick={onClose} className="text-ink-500 hover:text-white">✕</button>
      </div>
      <div className="space-y-3 px-5 py-5">
        <p className="text-xs text-ink-500">One name per line. Each becomes a player at the starting ELO below.</p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={'Alex Chen\nMaria Lopez\nJohn Smith'}
          className="w-full rounded-lg bg-ink-900 px-3 py-2 font-mono text-sm outline-none ring-1 ring-ink-700"
        />
        <L label={`Starting ELO · ${elo}`}>
          <input type="range" min={700} max={2000} step={10} value={elo} onChange={(e) => setElo(Number(e.target.value))} className="w-full accent-brand" />
        </L>
      </div>
      <div className="flex items-center gap-2 border-t border-ink-800 px-5 py-4">
        <span className="text-sm text-ink-500">{names.length} player{names.length === 1 ? '' : 's'}</span>
        <div className="flex-1" />
        <button onClick={onClose} className="rounded-lg bg-ink-800 px-4 py-2.5 text-sm font-semibold text-ink-300">Cancel</button>
        <button disabled={busy || names.length === 0} onClick={() => onSave(names, elo)} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-ink-900 disabled:opacity-40">
          {busy ? 'Adding…' : `Add ${names.length}`}
        </button>
      </div>
    </Modal>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      {children}
    </div>
  )
}
