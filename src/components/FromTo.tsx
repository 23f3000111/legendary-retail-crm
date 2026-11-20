import { TextInput } from './ui/Field'
import { chooseDates } from '../lib/periods'
import type { DateStr } from '../data/types'

/**
 * From and To, two calendars (20 November: "put calendars to select start
 * date and end date"). The dates are kept in order and never past today.
 */
export function FromTo({
  from,
  to,
  today,
  onChange,
  label,
}: {
  from: DateStr
  to: DateStr
  today: DateStr
  onChange: (from: DateStr, to: DateStr) => void
  /** Names the dates for a screen reader: "Dealers". */
  label?: string
}) {
  const set = (a: DateStr, b: DateStr) => {
    const next = chooseDates(a, b, today)
    onChange(next.from, next.to)
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="eyebrow mb-1 block">From</span>
        <TextInput
          type="date"
          aria-label={label ? `${label}: from` : 'From'}
          value={from}
          max={today}
          onChange={(e) => set(e.target.value, to)}
          className="h-9 w-[150px] text-[12.5px]"
        />
      </label>
      <label className="block">
        <span className="eyebrow mb-1 block">To</span>
        <TextInput
          type="date"
          aria-label={label ? `${label}: to` : 'To'}
          value={to}
          max={today}
          onChange={(e) => set(from, e.target.value)}
          className="h-9 w-[150px] text-[12.5px]"
        />
      </label>
    </div>
  )
}
