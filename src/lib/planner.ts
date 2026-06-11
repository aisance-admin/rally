// Timing engine: split N players into balanced leagues (size 3-6) and estimate
// timing so leagues finish at roughly the same time given the table count.

export interface PlannedLeague {
  index: number
  size: number
  rounds: number
  matches: number
  tablesUsed: number
  estMinutes: number
}

export interface EventPlan {
  leagues: PlannedLeague[]
  qualifierMinutes: number
  totalMinutes: number
  tablesNeeded: number
  finishSpreadMin: number
  fits: boolean
  warnings: string[]
}

export interface PlanOpts {
  withQualifier: boolean
  setMinutes: number // minutes per single set incl. changeover
}

const MIN = 3
const MAX = 6

/** Pick a league count that yields sizes in [3,6], closest to ~5. */
function chooseLeagueCount(n: number): number {
  if (n < MIN) return 1
  const minL = Math.ceil(n / MAX)
  const maxL = Math.floor(n / MIN)
  let best = Math.max(minL, Math.min(maxL, Math.round(n / 5)))
  // nudge toward sizes near 5
  let bestScore = Infinity
  for (let L = minL; L <= maxL; L++) {
    const avg = n / L
    const score = Math.abs(avg - 5)
    if (score < bestScore) {
      bestScore = score
      best = L
    }
  }
  return Math.max(1, best)
}

/** Distribute n into L groups as evenly as possible. */
function distribute(n: number, L: number): number[] {
  const base = Math.floor(n / L)
  const rem = n % L
  const sizes: number[] = []
  for (let i = 0; i < L; i++) sizes.push(base + (i < rem ? 1 : 0))
  return sizes.sort((a, b) => b - a)
}

/** Public helper: balanced league sizes (3-6) for n players, largest first. */
export function leagueSizes(n: number): number[] {
  if (n < MIN) return n > 0 ? [n] : []
  return distribute(n, chooseLeagueCount(n))
}

/** Round-robin schedule (circle method). Returns rounds of [i,j] index pairs. */
export function roundRobin(playerIdx: number[]): [number, number][][] {
  const ids = [...playerIdx]
  if (ids.length % 2 === 1) ids.push(-1) // bye marker
  const n = ids.length
  const rounds: [number, number][][] = []
  const arr = [...ids]
  for (let r = 0; r < n - 1; r++) {
    const pairs: [number, number][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]
      const b = arr[n - 1 - i]
      if (a !== -1 && b !== -1) pairs.push([a, b])
    }
    rounds.push(pairs)
    // rotate, keeping first fixed
    arr.splice(1, 0, arr.pop()!)
  }
  return rounds
}

function roundsFor(size: number): number {
  // round-robin: even -> size-1 rounds, odd -> size rounds (with a bye each round)
  return size % 2 === 0 ? size - 1 : size
}

export function planEvent(
  participantCount: number,
  tables: number,
  durationMin: number,
  opts: PlanOpts,
): EventPlan {
  const warnings: string[] = []
  const n = participantCount

  if (n < MIN) {
    return {
      leagues: [],
      qualifierMinutes: 0,
      totalMinutes: 0,
      tablesNeeded: 0,
      finishSpreadMin: 0,
      fits: false,
      warnings: [`Need at least ${MIN} players to run a league.`],
    }
  }

  const L = chooseLeagueCount(n)
  let sizes = distribute(n, L)

  // 5-player leagues are run as pools -> playoff (per spec): two pools + 1 final.
  const leagues: PlannedLeague[] = sizes.map((size, index) => {
    const matches =
      size === 5 ? /* 2+3 pools = 1 + 3 */ 4 + 1 : (size * (size - 1)) / 2
    const rounds = size === 5 ? 3 + 1 : roundsFor(size)
    const tablesUsed = Math.max(1, Math.floor(size / 2))
    const estMinutes = rounds * opts.setMinutes
    return { index, size, rounds, matches, tablesUsed, estMinutes }
  })

  const tablesNeeded = leagues.reduce((s, l) => s + l.tablesUsed, 0)
  if (tablesNeeded > tables) {
    warnings.push(
      `Leagues want ${tablesNeeded} tables to run in parallel; only ${tables} available — some leagues will queue.`,
    )
  }

  // If we have enough tables, all leagues run their rounds concurrently and the
  // play phase ≈ the slowest league. Otherwise scale by table contention.
  const parallelFactor = Math.max(1, tablesNeeded / tables)
  const slowest = Math.max(...leagues.map((l) => l.estMinutes))
  const playMinutes = Math.round(slowest * parallelFactor)

  const qualifierMinutes = opts.withQualifier
    ? Math.ceil(n / Math.max(1, tables * 2)) * opts.setMinutes + opts.setMinutes
    : 0

  const totalMinutes = qualifierMinutes + playMinutes
  const finishSpreadMin =
    Math.max(...leagues.map((l) => l.estMinutes)) -
    Math.min(...leagues.map((l) => l.estMinutes))

  const fits = totalMinutes <= durationMin
  if (!fits) {
    warnings.push(
      `Estimated ${totalMinutes} min exceeds the ${durationMin} min window — shorten sets, drop the qualifier, or add tables.`,
    )
  }

  return {
    leagues,
    qualifierMinutes,
    totalMinutes,
    tablesNeeded,
    finishSpreadMin,
    fits,
    warnings,
  }
}
