import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppData } from '../types'
import * as api from './api'
import type { PlayerInput, RecordMatchInput } from './api'
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
  recordMatch: (input: RecordMatchInput) => Promise<void>
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
      setData(d)
      setError(null)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [])

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
      await api.recordMatch(input, latest.current.players)
      await refresh()
    },
  }
}

export type { RecordMatchInput }
