import { create } from 'zustand'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from './icons'

type Tone = 'good' | 'critical' | 'info'

interface Toast {
  id: number
  tone: Tone
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (message: string, tone?: Tone) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, tone = 'info') => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, tone, message }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/**
 * Confirmation lands in the same words as the action that caused it — "Approve
 * order" produces "Order approved", never "Success".
 */
export function ToastHost() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)

  const tones: Record<Tone, { ring: string; icon: 'check' | 'alert' | 'sparkle'; text: string }> = {
    good: { ring: 'border-good/35', icon: 'check', text: 'text-good' },
    critical: { ring: 'border-critical/35', icon: 'alert', text: 'text-critical' },
    info: { ring: 'border-primary/35', icon: 'sparkle', text: 'text-primary' },
  }

  return (
    <div
      className="no-print pointer-events-none fixed bottom-16 left-1/2 z-[70] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const tone = tones[t.tone]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              className={`pointer-events-auto flex w-full items-center gap-3 rounded-2xl border ${tone.ring} bg-surface px-4 py-3 shadow-lift`}
            >
              <Icon name={tone.icon} className={`h-4 w-4 shrink-0 ${tone.text}`} strokeWidth={2} />
              <p className="flex-1 text-[13px] text-ink">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="text-ink-3 transition-colors hover:text-ink"
              >
                <Icon name="x" className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
