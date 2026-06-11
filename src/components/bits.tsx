import { colorFor, initials } from '../lib/format'

export function Avatar({
  name,
  size = 36,
}: {
  name: string
  size?: number
}) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: colorFor(name),
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
      }}
    >
      {initials(name)}
    </div>
  )
}

export function FormDots({ form }: { form: ('W' | 'L')[] }) {
  return (
    <div className="flex gap-1">
      {form.slice(0, 5).map((f, i) => (
        <span
          key={i}
          title={f === 'W' ? 'Win' : 'Loss'}
          className="h-1.5 w-3 rounded-full"
          style={{ background: f === 'W' ? '#32d74b' : '#ff453a', opacity: 1 - i * 0.12 }}
        />
      ))}
    </div>
  )
}

export function Sparkline({
  data,
  color = '#ff5500',
  width = 120,
  height = 34,
}: {
  data: number[]
  color?: string
  width?: number
  height?: number
}) {
  if (data.length < 2) return <div style={{ width, height }} />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return [x, y] as const
  })
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${d} L${width},${height} L0,${height} Z`
  const up = data[data.length - 1] >= data[0]
  const stroke = color
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`g${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#g${color})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={up ? '#32d74b' : '#ff453a'} />
    </svg>
  )
}

export function Badge({
  children,
  color = '#9aa4b2',
}: {
  children: React.ReactNode
  color?: string
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ color, background: `${color}1a`, boxShadow: `inset 0 0 0 1px ${color}33` }}
    >
      {children}
    </span>
  )
}
