import { useState } from 'react'
import { useStore } from './lib/store'
import { Leaderboard } from './components/Leaderboard'
import { MatchesFeed } from './components/MatchesFeed'
import { EventRunner } from './components/EventRunner'
import { PlayersAdmin } from './components/PlayersAdmin'
import { PlayerModal } from './components/PlayerModal'
import { Modal } from './components/Modal'

type Tab = 'leaderboard' | 'roster' | 'events' | 'matches'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
  { id: 'roster', label: 'Roster', icon: '👥' },
  { id: 'events', label: 'Leagues', icon: '⚡' },
  { id: 'matches', label: 'Matches', icon: '🏓' },
]

export default function App() {
  const store = useStore()
  const [tab, setTab] = useState<Tab>('leaderboard')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)

  const selected = store.players.find((p) => p.id === selectedId) ?? null
  const isEmpty = store.players.length === 0
  const liveEvent = store.events.find((e) => e.status === 'live')

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
      <>
        <div className="aurora" />
        <div className="grid min-h-full place-items-center">
          <div className="flex flex-col items-center gap-4 text-ink-500">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand text-2xl font-black text-ink-900 glow-brand pulse-dot">R</div>
            <span className="text-sm tracking-wide">Loading league…</span>
          </div>
        </div>
      </>
    )
  }

  if (store.error && !store.ready) {
    return (
      <>
        <div className="aurora" />
        <div className="grid min-h-full place-items-center px-6">
          <div className="glass max-w-md rounded-3xl p-6">
            <div className="text-2xl">⚠️</div>
            <h1 className="mt-2 text-lg font-bold">Supabase not configured</h1>
            <p className="mt-1 text-sm text-ink-500">{store.error}</p>
            <p className="mt-3 text-xs text-ink-500">Set <code className="text-brand">VITE_SUPABASE_URL</code> and <code className="text-brand">VITE_SUPABASE_KEY</code> in <code>.env</code>, then restart the dev server.</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="aurora" />
      <div className="mx-auto min-h-full max-w-5xl px-3 pb-28 sm:px-5">
        <header className="glass-bar sticky top-0 z-30 -mx-3 mb-5 px-3 py-3 sm:-mx-5 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand2 text-lg font-black text-white glow-brand">R</div>
              <div className="leading-tight">
                <div className="flex items-baseline gap-1.5 text-[17px] font-extrabold tracking-tight">
                  RALLY
                  <span className="hidden text-sm font-medium text-ink-500 sm:inline">Table Tennis</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-win pulse-dot" /> Live
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => run(store.reseedMock)}
                disabled={busy}
                className="glass-soft tap rounded-xl px-3 py-2 text-xs font-semibold text-ink-300 hover:text-white disabled:opacity-40"
                title="Replace data with the sample roster"
              >
                {busy ? '…' : isEmpty ? '＋ Sample' : '↻ Reset'}
              </button>
              <button
                onClick={() => setConfirmClear(true)}
                disabled={isEmpty || busy}
                className="tap rounded-xl px-3 py-2 text-xs font-semibold text-loss ring-1 ring-loss/30 transition hover:bg-loss/10 disabled:cursor-not-allowed disabled:opacity-30"
                title="Delete all data"
              >
                🗑
              </button>
            </div>
          </div>

          {!isEmpty && (
            <div className="mt-3 flex gap-4 text-xs text-ink-500">
              <span><b className="text-white">{store.players.length}</b> players</span>
              <span><b className="text-white">{store.matches.length}</b> matches</span>
              {liveEvent && <span className="font-semibold text-win">● {liveEvent.name} · S{liveEvent.season}</span>}
            </div>
          )}

          <nav className="mt-3 flex gap-1.5 overflow-x-auto">
            {TABS.map((t) => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`tap flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition-all ${
                    active ? 'glass text-white' : 'text-ink-500 hover:text-ink-300'
                  }`}
                >
                  <span className={active ? '' : 'opacity-70'}>{t.icon}</span>
                  {t.label}
                  {t.id === 'events' && liveEvent && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-win pulse-dot" />}
                </button>
              )
            })}
          </nav>
        </header>

        <main key={tab} className="animate-fade">
          {tab === 'leaderboard' && <Leaderboard players={store.players} divisions={store.divisions} onSelect={setSelectedId} />}
          {tab === 'roster' && <PlayersAdmin store={store} onSelect={setSelectedId} />}
          {tab === 'events' && <EventRunner store={store} onSelect={setSelectedId} />}
          {tab === 'matches' && (
            <MatchesFeed matches={store.matches} players={store.players} divisions={store.divisions} onSelect={setSelectedId} />
          )}
        </main>
      </div>

      {selected && (
        <PlayerModal player={selected} players={store.players} divisions={store.divisions} matches={store.matches} onClose={() => setSelectedId(null)} onSelect={setSelectedId} />
      )}

      {confirmClear && (
        <Modal onClose={() => setConfirmClear(false)}>
          <div className="px-5 py-5">
            <div className="text-3xl">🗑</div>
            <h3 className="mt-2 text-lg font-bold">Delete all data?</h3>
            <p className="mt-1 text-sm text-ink-500">Wipes every player, match, and league from the database. You can reload the sample roster afterwards.</p>
          </div>
          <div className="flex gap-2 border-t hairline px-5 py-4">
            <button onClick={() => setConfirmClear(false)} className="glass-soft tap flex-1 rounded-xl py-2.5 text-sm font-semibold text-ink-300 hover:text-white">Cancel</button>
            <button
              onClick={() => run(async () => { await store.clearAll(); setConfirmClear(false) })}
              className="tap flex-1 rounded-xl bg-loss py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              Delete everything
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
