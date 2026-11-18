/**
 * A designed report, for printing or saving as a PDF (client, 1 November: the
 * CSV export "looks very boring and bland", and a report "where he can see the
 * numbers in a more graphic way" is welcome).
 *
 * It opens in a new tab as a page of its own — the Legendary mark, the
 * figures in boxes, the rules it was drawn up with, a bar chart, and the
 * table with its totals — and brings up the browser's print dialog, where
 * "Save as PDF" makes the file. Nothing is sent anywhere.
 */

/** One titled table of a report of several parts (Revision 10). */
export interface ReportSection {
  title: string
  headers: string[]
  /** Which columns are figures, set right. */
  right: boolean[]
  rows: string[][]
  /** Rows that are a product's subtotal, set in bold. */
  subtotals?: number[]
  total?: string[]
}

export interface ReportSpec {
  /** "Sales report · Pavilion 5th Floor". */
  title: string
  /** "1 Oct 2026 to 20 Oct 2026". */
  subtitle: string
  boxes?: { label: string; value: string; note?: string }[]
  /** What the report was narrowed to, in words. */
  rules?: string[]
  chart?: { title: string; bars: { label: string; value: number; display: string }[] }
  /** The one table of a simple report, under "Figures". */
  table?: {
    headers: string[]
    /** Which columns are figures, set right. */
    right: boolean[]
    rows: string[][]
    total?: string[]
  }
  /** A detailed report's parts, each under its own title, after the table if there is one. */
  sections?: ReportSection[]
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const BOX_COLOURS = ['#7c3aed', '#2563eb', '#0891b2', '#0d9488']

export const reportHtml = (spec: ReportSpec, logoUrl: string, printedAt: string): string => {
  const max = Math.max(1, ...(spec.chart?.bars.map((b) => b.value) ?? [0]))
  const cell = (v: string, right: boolean, tag = 'td') => `<${tag} class="${right ? 'r' : ''}">${esc(v)}</${tag}>`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(spec.title)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; padding: 28px 32px; font: 13px/1.45 "Segoe UI", system-ui, -apple-system, sans-serif; color: #0f172a; background: #fff; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; border-radius: 14px;
    background: linear-gradient(110deg, #4338ca, #7c3aed); color: #fff; }
  header img { height: 26px; filter: brightness(0) invert(1); }
  header .meta { text-align: right; font-size: 11px; opacity: .85; }
  h1 { margin: 20px 0 2px; font-size: 22px; letter-spacing: -.01em; }
  .sub { color: #475569; margin: 0 0 16px; }
  .boxes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .box { border-radius: 12px; padding: 12px 14px; color: #fff; }
  .box .l { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; opacity: .85; font-weight: 600; }
  .box .v { font-size: 20px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .box .n { font-size: 11px; opacity: .85; margin-top: 2px; }
  .rules { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 16px; padding: 0; list-style: none; }
  .rules li { border: 1px solid #c7d2fe; background: #eef2ff; color: #3730a3; border-radius: 999px; padding: 3px 10px; font-size: 11.5px; }
  h2 { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #64748b; margin: 18px 0 8px; }
  .bar { display: grid; grid-template-columns: 170px 1fr 110px; align-items: center; gap: 10px; margin: 4px 0; }
  .bar .t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #334155; font-size: 12px; }
  .bar .track { height: 12px; background: #f1f5f9; border-radius: 999px; overflow: hidden; }
  .bar .fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #6366f1, #8b5cf6); }
  .bar .d { text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { text-align: left; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #64748b; padding: 6px 8px; border-bottom: 1.5px solid #cbd5e1; }
  td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-variant-numeric: tabular-nums; }
  tr:nth-child(even) td { background: #f8fafc; }
  .r { text-align: right; }
  tfoot td { font-weight: 700; border-top: 1.5px solid #94a3b8; border-bottom: none; background: #eef2ff !important; }
  tr.sub td { font-weight: 700; background: #f1f5f9 !important; border-bottom: 1.5px solid #cbd5e1; }
  section { break-inside: auto; }
  thead { display: table-header-group; }
  footer { margin-top: 22px; color: #94a3b8; font-size: 10.5px; }
  @page { margin: 12mm; }
  @media print { body { padding: 0; } }
</style></head>
<body>
<header><img src="${esc(logoUrl)}" alt="Legendary"><div class="meta">Retail CRM<br>Printed ${esc(printedAt)}</div></header>
<h1>${esc(spec.title)}</h1>
<p class="sub">${esc(spec.subtitle)}</p>
${
  spec.boxes?.length
    ? `<div class="boxes">${spec.boxes
        .map(
          (b, i) =>
            `<div class="box" style="background:${BOX_COLOURS[i % BOX_COLOURS.length]}"><div class="l">${esc(b.label)}</div><div class="v">${esc(
              b.value,
            )}</div>${b.note ? `<div class="n">${esc(b.note)}</div>` : ''}</div>`,
        )
        .join('')}</div>`
    : ''
}
${spec.rules?.length ? `<ul class="rules">${spec.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
${
  spec.chart && spec.chart.bars.length
    ? `<h2>${esc(spec.chart.title)}</h2>${spec.chart.bars
        .map(
          (b) =>
            `<div class="bar"><span class="t">${esc(b.label)}</span><span class="track"><span class="fill" style="display:block;width:${(
              (Math.max(0, b.value) / max) *
              100
            ).toFixed(1)}%"></span></span><span class="d">${esc(b.display)}</span></div>`,
        )
        .join('')}`
    : ''
}
${spec.table ? tableHtml({ title: 'Figures', ...spec.table }, cell) : ''}
${(spec.sections ?? []).map((sec) => tableHtml(sec, cell)).join('')}
<footer>Legendary Retail CRM · figures exclude SST · days that have ended are as filed, today as it stands.</footer>
</body></html>`
}

/** One titled table, with its subtotal rows in bold and its total at the foot. */
const tableHtml = (sec: ReportSection, cell: (v: string, right: boolean, tag?: string) => string): string => {
  const subs = new Set(sec.subtotals ?? [])
  return `<section><h2>${esc(sec.title)}</h2>
<table>
<thead><tr>${sec.headers.map((h, i) => cell(h, sec.right[i], 'th')).join('')}</tr></thead>
<tbody>${sec.rows
    .map((r, n) => `<tr${subs.has(n) ? ' class="sub"' : ''}>${r.map((v, i) => cell(v, sec.right[i])).join('')}</tr>`)
    .join('')}</tbody>
${sec.total ? `<tfoot><tr>${sec.total.map((v, i) => cell(v, sec.right[i])).join('')}</tr></tfoot>` : ''}
</table></section>`
}

/**
 * Opens the report in a new tab and brings up the print dialog. Returns false
 * when the browser blocked the new tab, so the screen can say so.
 */
export function openPrintReport(spec: ReportSpec): boolean {
  const logo = new URL(`${import.meta.env.BASE_URL}logo-legendary.png`, window.location.href).href
  const printedAt = new Date().toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' })
  // Every value in it is escaped; it is handed over as a file of its own
  // rather than written into the tab.
  const url = URL.createObjectURL(new Blob([reportHtml(spec, logo, printedAt)], { type: 'text/html' }))
  const w = window.open(url, '_blank')
  if (!w) {
    URL.revokeObjectURL(url)
    return false
  }
  // Once it has loaded, the mark included, so it prints.
  w.addEventListener(
    'load',
    () => {
      w.focus()
      w.print()
    },
    { once: true },
  )
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}
