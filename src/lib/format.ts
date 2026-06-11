export function timeAgo(iso: string): string {
  const diff = Date.now() - +new Date(iso)
  const abs = Math.abs(diff)
  const m = Math.round(abs / 60000)
  const h = Math.round(abs / 3600000)
  const d = Math.round(abs / 86400000)
  const fut = diff < 0
  let s: string
  if (m < 1) s = 'just now'
  else if (m < 60) s = `${m}m`
  else if (h < 24) s = `${h}h`
  else if (d < 30) s = `${d}d`
  else s = `${Math.round(d / 30)}mo`
  if (s === 'just now') return s
  return fut ? `in ${s}` : `${s} ago`
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// Stable color from a string (for avatars).
export function colorFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return `hsl(${h} 55% 45%)`
}

export function winRate(wins: number, losses: number): number {
  const t = wins + losses
  return t === 0 ? 0 : Math.round((wins / t) * 100)
}
