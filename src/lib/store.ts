import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppData } from '../types'
import * as api from './api'
import type { Backup, MatchOpResult, PlayerInput, RecordMatchInput } from './api'
import { supabaseReady } from './supabase'

const EMPTY: AppData = { players: [], divisions: [], matches: [], events: [], seeded: false }

export interface Store extends AppData {
  loading: boolean
  error: string | null
  ready: boolean
  refresh: () => Promise<void>
  reseedMock: () => Promise<void>
  clearAll: () => Promise<void>
  createPlayer: (input: PlayerInput) => Promise<void>
  bulkAddPlayers: (names: string[], defaultElo?: number) => Promise<number>
  updatePlayer: (
    id: string,
    patch: Partial<{ name: string; handle: string; country: string; elo: number }>,
  ) => Promise<void>
  deletePlayer: (id: string) => Promise<void>
  recordMatch: (input: RecordMatchInput) => Promise<MatchOpResult>
  deleteMatch: (matchId: string) => Promise<MatchOpResult>
  validateLeague: (leagueId: string, on: boolean) => Promise<void>
  exportData: () => Promise<Backup>
  importData: (backup: Backup) => Promise<void>
}

export function useStore(): Store {
  const [data, setData] = useState<AppData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef<AppData>(EMPTY)
  latest.current = data

  const refresh = useCallback(async () => {
    try {
      const d = await api.fetchAll()
      latest.current = d
      setData(d)
      setError(null)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Patch matches + players in place from a match op — no full refetch (keeps scroll/standings live).
  const applyOp = (res: MatchOpResult) => {
    const d = latest.current
    let matches = d.matches
    if (res.removedId) matches = matches.filter((m) => m.id !== res.removedId)
    if (res.match) matches = [res.match, ...matches.filter((m) => m.id !== res.match!.id)]
    const pmap = new Map(res.patches.map((p) => [p.id, p]))
    const players = pmap.size
      ? d.players.map((p) => {
          const pt = pmap.get(p.id)
          return pt ? { ...p, elo: pt.elo, peakElo: pt.peakElo, wins: pt.wins, losses: pt.losses, form: pt.form, history: pt.history, divisionId: pt.divisionId } : p
        })
      : d.players
    const next = { ...d, matches, players }
    latest.current = next
    setData(next)
  }

  useEffect(() => {
    if (!supabaseReady) {
      setError('Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_KEY).')
      setLoading(false)
      return
    }
    refresh()
  }, [refresh])

  return {
    ...data,
    loading,
    error,
    ready: supabaseReady,
    refresh,
    reseedMock: async () => {
      await api.clearAll()
      await api.seedMockRoster()
      await refresh()
    },
    clearAll: async () => {
      await api.clearAll()
      await refresh()
    },
    createPlayer: async (input) => {
      await api.createPlayer(input)
      await refresh()
    },
    bulkAddPlayers: async (names, defaultElo) => {
      const n = await api.bulkCreatePlayers(names, defaultElo)
      await refresh()
      return n
    },
    updatePlayer: async (id, patch) => {
      await api.updatePlayer(id, patch)
      await refresh()
    },
    deletePlayer: async (id) => {
      await api.deletePlayer(id)
      await refresh()
    },
    recordMatch: async (input) => {
      const res = await api.recordMatch(input, latest.current.players, latest.current.matches)
      applyOp(res)
      return res
    },
    deleteMatch: async (matchId) => {
      const res = await api.deleteMatch(matchId, latest.current.players, latest.current.matches)
      applyOp(res)
      return res
    },
    validateLeague: async (leagueId, on) => {
      await api.validateLeague(leagueId, on)
    },
    exportData: () => api.exportAll(),
    importData: async (backup) => {
      await api.importAll(backup)
      await refresh()
    },
  }
}

export type { RecordMatchInput }
export type { Backup } from './api'
