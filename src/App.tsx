import { useState } from 'react'
import { useStore } from './lib/store'
import { Leaderboard } from './components/Leaderboard'
import { Divisions } from './components/Divisions'
import { MatchesFeed } from './components/MatchesFeed'
import { EventRunner } from './components/EventRunner'
import { PlayersAdmin } from './components/PlayersAdmin'
import { PlayerModal } from './components/PlayerModal'
import { RecordMatchModal } from './components/RecordMatchModal'
import { Modal } from './components/Modal'

type Tab = 'leaderboard' | 'roster' | 'events' | 'divisions' | 'matches'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
  { id: 'roster', label: 'Roster', icon: '👥' },
  { id: 'events', label: 'Events', icon: '⚡' },
  { id: 'divisions', label: 'Divisions', icon: '🗂' },
  { id: 'matches', label: 'Matches', icon: '🏓' },
]

export default function App() {
  const store = useStore()
  const [tab, setTab] = useState<Tab>('leaderboard')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)

  const selected = store.players.find((p) => p.id === selectedId) ?? null
  const isEmpty = store.players.length === 0
  const liveEvent = store.events.find((e) => e.status === 'live' || e.status === 'qualifying')

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  if (store.loading) {
    return (
      <div className="grid min-h-full place-items-center">
        <div className="flex items-center gap-3 text-ink-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-600 border-t-brand" />
          Loading league…
        </div>
      </div>
    )
  }

  if (store.error && !store.ready) {
    return (
      <div className="grid min-h-full place-items-center px-6">
        <div className="max-w-md rounded-xl bg-ink-850 p-6 ring-1 ring-loss/30">
          <div className="text-2xl">⚠️</div>
          <h1 className="mt-2 text-lg font-bold">Supabase not configured</h1>
          <p className="mt-1 text-sm text-ink-500">{store.error}</p>
          <p className="mt-3 text-xs text-ink-500">Set <code className="text-brand">VITE_SUPABASE_URL</code> and <code className="text-brand">VITE_SUPABASE_KEY</code> in <code>.env</code>, then restart the dev server.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-full max-w-5xl px-3 pb-24 sm:px-5">
      <header className="sticky top-0 z-30 -mx-3 mb-4 border-b border-ink-800 bg-ink-900/85 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-lg font-black text-ink-900 shadow-glow">R</div>
            <div className="leading-tight">
              <div className="flex items-center gap-1.5 font-extrabold tracking-tight">
                RALLY <span className="text-brand">·</span>
                <span className="hidden text-ink-500 sm:inline">Table Tennis Leagues</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
                <span className="h-1.5 w-1.5 rounded-full bg-win" /> Live · Supabase
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => run(store.reseedMock)}
              disabled={busy}
              className="rounded-lg bg-ink-800 px-3 py-2 text-xs font-semibold text-ink-300 ring-1 ring-ink-700 transition hover:text-white disabled:opacity-40"
              title="Replace data with the sample roster"
            >
              {busy ? '…' : isEmpty ? '＋ Sample roster' : '↻ Reset sample'}
            </button>
            <button
              onClick={() => setConfirmClear(true)}
              disabled={isEmpty || busy}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-loss ring-1 ring-loss/30 transition hover:bg-loss/10 disabled:cursor-not-allowed disabled:opacity-30"
              title="Delete all data"
            >
              🗑 Clear
            </button>
          </div>
        </div>

        {!isEmpty && (
          <div className="mt-3 flex gap-4 text-xs text-ink-500">
            <span><b className="text-white">{store.players.length}</b> players</span>
            <span><b className="text-white">{store.matches.length}</b> matches</span>
            {liveEvent && <span className="font-semibold text-win">● {liveEvent.name} live</span>}
          </div>
        )}

        <nav className="mt-3 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
              style={tab === t.id ? { background: '#ff550018', color: '#ff7a33', boxShadow: 'inset 0 0 0 1px #ff550044' } : { color: '#8a93a3' }}
            >
              <span>{t.icon}</span>
              {t.label}
              {t.id === 'events' && liveEvent && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-win" />}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {tab === 'leaderboard' && <Leaderboard players={store.players} divisions={store.divisions} onSelect={setSelectedId} />}
        {tab === 'roster' && <PlayersAdmin store={store} onSelect={setSelectedId} />}
        {tab === 'events' && <EventRunner store={store} onSelect={setSelectedId} />}
        {tab === 'divisions' && <Divisions players={store.players} divisions={store.divisions} onSelect={setSelectedId} />}
        {tab === 'matches' && (
          <MatchesFeed matches={store.matches} players={store.players} divisions={store.divisions} onSelect={setSelectedId} onRecord={() => setRecording(true)} />
        )}
      </main>

      {selected && (
        <PlayerModal player={selected} players={store.players} divisions={store.divisions} matches={store.matches} onClose={() => setSelectedId(null)} onSelect={setSelectedId} />
      )}

      {recording && (
        <RecordMatchModal players={store.players} onClose={() => setRecording(false)} onSubmit={store.recordMatch} />
      )}

      {confirmClear && (
        <Modal onClose={() => setConfirmClear(false)}>
          <div className="px-5 py-5">
            <div className="text-3xl">🗑</div>
            <h3 className="mt-2 text-lg font-bold">Delete all data?</h3>
            <p className="mt-1 text-sm text-ink-500">Wipes every player, match, and event from the database. Divisions are kept. You can reload the sample roster afterwards.</p>
          </div>
          <div className="flex gap-2 border-t border-ink-800 px-5 py-4">
            <button onClick={() => setConfirmClear(false)} className="flex-1 rounded-lg bg-ink-800 py-2.5 text-sm font-semibold text-ink-300 hover:text-white">Cancel</button>
            <button
              onClick={() => run(async () => { await store.clearAll(); setConfirmClear(false) })}
              className="flex-1 rounded-lg bg-loss py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              Delete everything
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
