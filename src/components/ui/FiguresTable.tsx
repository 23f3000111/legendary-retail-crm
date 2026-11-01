import type { ReactNode } from 'react'

export interface FiguresColumn<T> {
  header: string
  align?: 'left' | 'right'
  render: (row: T) => ReactNode
  /** What the column adds up to, at its foot. Columns without one leave the cell empty. */
  total?: ReactNode
}

/**
 * A plain table of figures with a total at the foot of every column that has
 * one (client, 1 November: "ensure all items with column amounts have a total
 * at the bottom of the column"). The first column's foot says "Total".
 */
export function FiguresTable<T>({
  columns,
  rows,
  rowKey,
  empty = 'Nothing to show.',
  onRowClick,
}: {
  columns: FiguresColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  empty?: ReactNode
  /** A row that opens something: the whole row takes the tap. */
  onRowClick?: (row: T) => void
}) {
  if (!rows.length) return <p className="py-4 text-center text-[12.5px] text-ink-3">{empty}</p>
  const hasTotal = columns.some((c) => c.total !== undefined)
  const align = (c: FiguresColumn<T>) => (c.align === 'right' ? 'text-right' : 'text-left')
  return (
    <div className="scroll-x">
      <table className="w-full min-w-[320px] border-collapse">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th
                key={c.header}
                scope="col"
                className={`pb-2 pr-4 text-[10px] font-semibold uppercase tracking-wide2 text-ink-3 last:pr-0 ${align(c)}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={`border-b border-line/70 last:border-0 ${
                onRowClick ? 'cursor-pointer transition-colors hover:bg-primary/5' : ''
              }`}
            >
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={`py-1.5 pr-4 text-[12.5px] text-ink last:pr-0 ${align(c)} ${c.align === 'right' ? 'readout' : ''}`}
                >
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
          {hasTotal && (
            <tr className="border-t border-line">
              {columns.map((c, i) => (
                <td
                  key={c.header}
                  className={`py-1.5 pr-4 text-[12.5px] font-semibold last:pr-0 ${i === 0 ? 'text-ink-2' : 'text-ink'} ${align(c)} ${
                    c.align === 'right' ? 'readout' : ''
                  }`}
                >
                  {i === 0 ? 'Total' : c.total}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
