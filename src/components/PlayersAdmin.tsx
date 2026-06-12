import { useMemo, useState } from 'react'
import type { Player } from '../types'
import type { Store } from '../lib/store'
import { Avatar } from './bits'
import { SkillBadge } from './SkillBadge'
import { Modal } from './Modal'
import { winRate } from '../lib/format'

const brandBtn = 'tap rounded-xl bg-gradient-to-br from-brand to-brand2 text-white glow-brand disabled:opacity-40 disabled:shadow-none'

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
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="glass flex flex-1 items-center gap-2 rounded-2xl px-4 py-2.5">
          <span className="text-ink-500">🔎</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search roster…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-500"
          />
        </div>
        <button onClick={() => setBulk(true)} className="glass-soft tap rounded-xl px-3.5 py-2.5 text-sm font-semibold text-ink-300 hover:text-white">⎘ Bulk add</button>
        <button onClick={() => setAdding(true)} className={`${brandBtn} px-3.5 py-2.5 text-sm font-bold`}>+ Add player</button>
      </div>

      {store.players.length === 0 ? (
        <div className="glass grid place-items-center rounded-3xl py-16 text-center">
          <div className="text-5xl">🏓</div>
          <div className="mt-3 text-lg font-semibold">No players yet</div>
          <div className="mt-1 max-w-sm text-sm text-ink-500">Add players one by one, paste a whole list, or load the sample roster from the top bar.</div>
          <div className="mt-5 flex gap-2">
            <button onClick={() => setAdding(true)} className={`${brandBtn} px-4 py-2.5 text-sm`}>+ Add player</button>
            <button onClick={() => setBulk(true)} className="glass-soft tap rounded-xl px-4 py-2.5 text-sm font-semibold">Bulk add</button>
          </div>
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-3xl">
          <div className="divide-hair stagger">
            {list.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/5 sm:px-4">
                <SkillBadge elo={p.elo} size="sm" />
                <button onClick={() => onSelect(p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar name={p.name} size={32} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate font-semibold">{p.name} <span className="text-xs">{p.country}</span></div>
                    <div className="truncate text-xs text-ink-500">@{p.handle} · {p.wins}-{p.losses} · {winRate(p.wins, p.losses)}%</div>
                  </div>
                </button>
                <span className="font-mono text-sm font-bold text-white">{p.elo}</span>
                <button onClick={() => setEditing(p)} className="tap grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-white/10 hover:text-white" title="Edit">✎</button>
                <button onClick={() => setConfirmDelete(p)} className="tap grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-loss/15 hover:text-loss" title="Delete">🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(adding || editing) && (
        <PlayerForm
          player={editing}
          busy={busy}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSave={async (vals) => {
            setBusy(true)
            try {
              if (editing) await store.updatePlayer(editing.id, vals)
              else await store.createPlayer(vals)
              setAdding(false); setEditing(null)
            } finally { setBusy(false) }
          }}
        />
      )}

      {bulk && (
        <BulkAdd
          busy={busy}
          onClose={() => setBulk(false)}
          onSave={async (names, elo) => {
            setBusy(true)
            try { await store.bulkAddPlayers(names, elo); setBulk(false) } finally { setBusy(false) }
          }}
        />
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <div className="px-5 py-5">
            <h3 className="text-lg font-bold">Delete {confirmDelete.name}?</h3>
            <p className="mt-1 text-sm text-ink-500">This permanently removes the player and their match history.</p>
          </div>
          <div className="flex gap-2 border-t hairline px-5 py-4">
            <button onClick={() => setConfirmDelete(null)} className="glass-soft tap flex-1 rounded-xl py-2.5 text-sm font-semibold text-ink-300">Cancel</button>
            <button onClick={async () => { await store.deletePlayer(confirmDelete.id); setConfirmDelete(null) }} className="tap flex-1 rounded-xl bg-loss py-2.5 text-sm font-bold text-white">Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

const FLAGS = ['🏓', '🇷🇺', '🇯🇵', '🇨🇳', '🇩🇪', '🇫🇷', '🇪🇸', '🇸🇪', '🇺🇸', '🇬🇧', '🇮🇳', '🇧🇷', '🇰🇷']
const fieldCls = 'w-full rounded-xl bg-white/5 px-3.5 py-2.5 text-sm outline-none ring-1 ring-white/10 focus:ring-brand/60'

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
      <div className="flex items-center justify-between border-b hairline px-5 py-4">
        <h3 className="font-bold">{player ? 'Edit player' : 'Add player'}</h3>
        <button onClick={onClose} className="text-ink-500 hover:text-white">✕</button>
      </div>
      <div className="space-y-3 px-5 py-5">
        <L label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} placeholder="Full name" /></L>
        <L label="Handle"><input value={handle} onChange={(e) => setHandle(e.target.value)} className={fieldCls} placeholder="auto from name" /></L>
        <div className="grid grid-cols-2 gap-3">
          <L label="Country">
            <div className="flex flex-wrap gap-1">
              {FLAGS.map((f) => (
                <button key={f} onClick={() => setCountry(f)} className="tap grid h-8 w-8 place-items-center rounded-lg text-lg" style={{ background: country === f ? 'rgba(255,106,61,0.22)' : 'rgba(255,255,255,0.05)', boxShadow: country === f ? 'inset 0 0 0 1.5px #ff6a3d' : 'none' }}>{f}</button>
              ))}
            </div>
          </L>
          <L label={`Starting rating · ${elo}`}>
            <input type="range" min={700} max={2200} step={10} value={elo} onChange={(e) => setElo(Number(e.target.value))} className="w-full accent-brand" />
            <input type="number" value={elo} onChange={(e) => setElo(Number(e.target.value) || 1000)} className="mt-1 w-full rounded-xl bg-white/5 px-3 py-1.5 text-center font-mono text-sm font-bold outline-none ring-1 ring-white/10" />
          </L>
        </div>
      </div>
      <div className="flex gap-2 border-t hairline px-5 py-4">
        <button onClick={onClose} className="glass-soft tap flex-1 rounded-xl py-2.5 text-sm font-semibold text-ink-300">Cancel</button>
        <button disabled={busy || !name.trim()} onClick={() => onSave({ name: name.trim(), handle: handle.trim(), country, elo })} className={`${brandBtn} flex-1 py-2.5 text-sm`}>{busy ? 'Saving…' : player ? 'Save changes' : 'Add player'}</button>
      </div>
    </Modal>
  )
}

function BulkAdd({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (names: string[], elo: number) => void }) {
  const [text, setText] = useState('')
  const [elo, setElo] = useState(1000)
  const names = text.split('\n').map((s) => s.trim()).filter(Boolean)

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between border-b hairline px-5 py-4">
        <h3 className="font-bold">Bulk add players</h3>
        <button onClick={onClose} className="text-ink-500 hover:text-white">✕</button>
      </div>
      <div className="space-y-3 px-5 py-5">
        <p className="text-xs text-ink-500">One name per line. Each becomes a player at the starting rating below.</p>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={'Alex Chen\nMaria Lopez\nJohn Smith'} className={`${fieldCls} font-mono`} />
        <L label={`Starting rating · ${elo}`}><input type="range" min={700} max={2000} step={10} value={elo} onChange={(e) => setElo(Number(e.target.value))} className="w-full accent-brand" /></L>
      </div>
      <div className="flex items-center gap-2 border-t hairline px-5 py-4">
        <span className="text-sm text-ink-500">{names.length} player{names.length === 1 ? '' : 's'}</span>
        <div className="flex-1" />
        <button onClick={onClose} className="glass-soft tap rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-300">Cancel</button>
        <button disabled={busy || names.length === 0} onClick={() => onSave(names, elo)} className={`${brandBtn} px-4 py-2.5 text-sm`}>{busy ? 'Adding…' : `Add ${names.length}`}</button>
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
