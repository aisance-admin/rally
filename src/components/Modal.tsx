import { useEffect } from 'react'

export function Modal({
  children,
  onClose,
  wide = false,
}: {
  children: React.ReactNode
  onClose: () => void
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end overflow-y-auto bg-black/60 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`animate-pop w-full overflow-hidden rounded-t-2xl bg-ink-850 ring-1 ring-ink-600 sm:rounded-2xl ${
          wide ? 'sm:max-w-xl' : 'sm:max-w-md'
        }`}
      >
        {children}
      </div>
    </div>
  )
}
