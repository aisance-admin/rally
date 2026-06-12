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
      className="animate-fade fixed inset-0 z-50 grid place-items-end overflow-y-auto bg-black/55 p-0 backdrop-blur-md sm:place-items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`animate-pop glass w-full overflow-hidden rounded-t-3xl sm:rounded-3xl ${
          wide ? 'sm:max-w-xl' : 'sm:max-w-md'
        }`}
      >
        <div className="mx-auto mb-1 mt-2 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
        {children}
      </div>
    </div>
  )
}
