import { Icon } from '../ui/icons'
import { isApproverNote, STATUS_CHAIN, STATUS_LABEL } from '../../lib/po-machine'
import { formatTimestamp } from '../../lib/dates'
import type { PurchaseOrder } from '../../data/types'

/**
 * The order's own history, rendered from its event trail rather than from its
 * current status — so what you see is what actually happened, including who did
 * it and what they said. A rejection ends the chain rather than greying it out.
 *
 * Finance's clearance is shown beside the chain, under the approval, since the
 * warehouse no longer waits for it.
 *
 * Kelly's notes — the approvers', Davy's too — are in green, the instruction
 * the warehouse follows; with `hideOthers` every other note folds away
 * (16 November). Nobody's note is changed: each stays as its writer left it.
 */
export function PoTimeline({ po, hideOthers = false }: { po: PurchaseOrder; hideOthers?: boolean }) {
  const rejected = po.status === 'rejected'
  const reachedAt = new Map(po.events.map((e) => [e.status, e]))
  const steps = rejected
    ? [...STATUS_CHAIN.slice(0, 2), 'rejected' as const]
    : STATUS_CHAIN
  const approved = reachedAt.has('approved')
  const cleared = po.financeClearedAt
    ? { by: po.financeClearedBy ?? 'Finance', at: po.financeClearedAt }
    : reachedAt.get('accounts_cleared')
      ? { by: reachedAt.get('accounts_cleared')!.actor, at: reachedAt.get('accounts_cleared')!.at }
      : null

  return (
    <ol className="relative">
      {steps.map((status, i) => {
        const event = reachedAt.get(status)
        const done = Boolean(event)
        const isLast = i === steps.length - 1
        const isRejection = status === 'rejected'

        return (
          <li key={status} className="relative flex gap-3 pb-4 last:pb-0">
            {!isLast && (
              <span
                className={`absolute left-[11px] top-6 bottom-0 w-px ${
                  done ? 'bg-primary/35' : 'bg-line'
                }`}
                aria-hidden="true"
              />
            )}

            <span
              className={`relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border ${
                isRejection && done
                  ? 'border-critical/60 bg-critical/15 text-critical'
                  : done
                    ? 'border-primary/55 bg-primary/15 text-primary'
                    : 'border-line bg-sunken text-ink-3'
              }`}
            >
              {done ? (
                <Icon
                  name={isRejection ? 'x' : 'check'}
                  className="h-3 w-3"
                  strokeWidth={2.4}
                />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              )}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={`text-[13px] leading-tight ${
                  done ? 'text-ink' : 'text-ink-3'
                }`}
              >
                {STATUS_LABEL[status]}
              </p>
              {event ? (
                <>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">
                    {event.actor} · {formatTimestamp(event.at)}
                  </p>
                  {event.note && isApproverNote(event) ? (
                    <div
                      className={`mt-1.5 rounded-md border-2 px-2.5 py-1.5 ${
                        isRejection ? 'border-critical/40 bg-critical/8' : 'border-good/55 bg-good/10'
                      }`}
                    >
                      <p className={`text-[10.5px] font-semibold uppercase tracking-wide2 ${isRejection ? 'text-critical' : 'text-good'}`}>
                        {event.actor}’s note
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-[12px] leading-relaxed text-ink">{event.note}</p>
                    </div>
                  ) : event.note && hideOthers ? (
                    <p className="mt-1 text-[11px] italic text-ink-3">Note hidden</p>
                  ) : (
                    event.note && (
                      <p
                        className={`mt-1.5 whitespace-pre-line rounded-md border px-2.5 py-1.5 text-[11.5px] leading-relaxed ${
                          isRejection
                            ? 'border-critical/25 bg-critical/8 text-ink'
                            : 'border-line bg-sunken text-ink-2'
                        }`}
                      >
                        {event.note}
                      </p>
                    )
                  )}
                </>
              ) : (
                <p className="mt-0.5 text-[11.5px] text-ink-3">Not yet</p>
              )}
              {status === 'approved' && approved && !rejected && (
                <p
                  className={`mt-1.5 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] ${
                    cleared ? 'border-primary/30 bg-primary/8 text-ink' : 'border-line bg-sunken text-ink-3'
                  }`}
                >
                  <Icon name={cleared ? 'check' : 'wallet'} className="h-3 w-3 shrink-0" strokeWidth={2.4} />
                  {cleared
                    ? `Cleared by Finance · ${cleared.by} · ${formatTimestamp(cleared.at)}`
                    : 'Finance has it too — not cleared yet'}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
