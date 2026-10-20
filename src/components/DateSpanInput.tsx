import { Select, TextInput } from './ui/Field'
import type { DateSpan } from '../lib/dates'
import type { DateStr } from '../data/types'

/**
 * "Equal" one date, or "between" two — the client's own words for a date
 * filter (20 October). Used for the store page's customers and Finance's
 * sales report. Each control sits in a box of its own width: the controls
 * themselves are full width.
 */
export function DateSpanInput({
  value,
  onChange,
  max,
  label = 'Business date',
}: {
  value: DateSpan
  onChange: (next: DateSpan) => void
  /** The last day that can be chosen: usually today. */
  max?: DateStr
  label?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-[118px]">
        <Select
          aria-label={`${label}: equal or between`}
          value={value.op}
          onChange={(e) => onChange({ ...value, op: e.target.value as DateSpan['op'] })}
          className="h-9 text-[12.5px]"
        >
          <option value="equal">equal</option>
          <option value="between">between</option>
        </Select>
      </div>
      <div className="w-[156px]">
        <TextInput
          type="date"
          aria-label={value.op === 'equal' ? label : `${label} from`}
          value={value.from}
          max={max}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          className="h-9 text-[12.5px]"
        />
      </div>
      {value.op === 'between' && (
        <>
          <span className="text-[12px] text-ink-3">and</span>
          <div className="w-[156px]">
            <TextInput
              type="date"
              aria-label={`${label} to`}
              value={value.to}
              max={max}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="h-9 text-[12.5px]"
            />
          </div>
        </>
      )}
    </div>
  )
}
