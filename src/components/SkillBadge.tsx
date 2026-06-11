import { skillFromElo } from '../lib/elo'

export function SkillBadge({ elo, size = 'md' }: { elo: number; size?: 'sm' | 'md' | 'lg' }) {
  const s = skillFromElo(elo)
  const dim = size === 'lg' ? 40 : size === 'sm' ? 24 : 32
  const font = size === 'lg' ? 18 : size === 'sm' ? 11 : 14
  return (
    <div
      title={`Level ${s.level} · ${s.label}`}
      className="relative grid place-items-center rounded-md font-extrabold tabular-nums"
      style={{
        width: dim,
        height: dim,
        fontSize: font,
        color: '#0b0d11',
        background: `linear-gradient(160deg, ${s.color}, ${s.color}cc)`,
        boxShadow: `0 0 0 1px ${s.color}55, 0 2px 8px ${s.color}33`,
      }}
    >
      {s.level}
    </div>
  )
}
