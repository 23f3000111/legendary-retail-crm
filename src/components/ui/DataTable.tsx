import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'

export interface Column<T> {
  key: string
  header: string
  /** Numbers sit right and wear the mono face so columns read down cleanly. */
  align?: 'left' | 'right'
  width?: string
  render: (row: T) => ReactNode
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  dense = false,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  empty?: ReactNode
  dense?: boolean
}) {
  if (!rows.length && empty) return <>{empty}</>

  return (
    // Wide tables scroll inside their own panel; the page never scrolls sideways.
    <div className="scroll-x">
      {/* `w-max` lets the declared column widths decide, so a narrow screen
          scrolls the table instead of crushing every cell; `min-w-full` keeps
          it filling the panel on a wide one. */}
      <table className="w-max min-w-full border-collapse">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={{ width: c.width }}
                className={`pb-2 text-[10px] font-semibold uppercase tracking-wide2 text-ink-3 ${
                  c.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onRowClick(row)
                      }
                    }
                  : undefined
              }
              className={`border-b border-line/70 last:border-0 ${
                onRowClick ? 'cursor-pointer transition-colors duration-150 hover:bg-sunken/70' : ''
              }`}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`${dense ? 'py-2' : 'py-2.5'} pr-4 text-[13px] last:pr-0 ${
                    c.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * An empty screen is an invitation to act, so it names the next step rather than
 * apologising for having nothing to show.
 */
export function EmptyState({
  icon = 'sparkle',
  title,
  body,
  action,
}: {
  icon?: IconName
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-line bg-sunken text-ink-3">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <p className="font-display text-[15px] font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-3">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
