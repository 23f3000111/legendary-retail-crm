import { rampColor, SEQUENTIAL } from './palette'
import { dayOfWeek, formatDayShort } from '../../lib/dates'
import type { SeriesPoint } from '../../store/selectors'

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/**
 * Trading intensity, one cell per day, weeks running left to right. Magnitude
 * gets the single-hue sequential ramp — never the categorical palette, which
 * would imply these days belong to different things.
 */
export function HeatCalendar({
  data,
  format,
}: {
  data: SeriesPoint[]
  format: (n: number) => string
}) {
  if (!data.length) return null

  const max = Math.max(...data.map((d) => d.value)) || 1

  // Pad the first week so each row starts on a Sunday.
  const lead = dayOfWeek(data[0].date)
  const cells: (SeriesPoint | null)[] = [...Array(lead).fill(null), ...data]
  const weeks: (SeriesPoint | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        <div className="flex shrink-0 flex-col gap-[3px] pr-1.5">
          {DAY_LABELS.map((d, i) => (
            <span
              key={i}
              className="flex h-[13px] w-3 items-center justify-center text-[8.5px] leading-none text-ink-3"
            >
              {i % 2 === 1 ? d : ''}
            </span>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex shrink-0 flex-col gap-[3px]">
            {Array.from({ length: 7 }).map((_, di) => {
              const cell = week[di]
              if (!cell) return <div key={di} className="h-[13px] w-[13px]" />
              return (
                <div
                  key={di}
                  className="h-[13px] w-[13px] rounded-[3px] transition-transform duration-150 hover:scale-125"
                  style={{ background: rampColor(cell.value / max) }}
                  title={`${formatDayShort(cell.date)} · ${format(cell.value)}`}
                />
              )
            })}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[10.5px] text-ink-3">Quieter</span>
        <div className="flex gap-[3px]">
          <span className="h-[11px] w-[11px] rounded-[3px]" style={{ background: '#E7EDF8' }} />
          {SEQUENTIAL.map((c) => (
            <span key={c} className="h-[11px] w-[11px] rounded-[3px]" style={{ background: c }} />
          ))}
        </div>
        <span className="text-[10.5px] text-ink-3">Busier</span>
        <span className="readout ml-auto text-[10.5px] text-ink-3">peak {format(max)}</span>
      </div>
    </div>
  )
}
