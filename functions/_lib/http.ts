/** Small shared pieces of the Backups page's server code. */

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

/** "10:02 on 19 Nov 2026", in Malaysia, for an alert. */
export const myt = (ms: number) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms))
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
  return `${p('hour')}:${p('minute')} on ${p('day')} ${p('month')} ${p('year')}`
}

/** Where Cloudflare places a visitor: "Kuala Lumpur, MY", as far as it knows. */
export const whereFrom = (request: Request) => {
  const cf = (request as Request & { cf?: { city?: string; country?: string } }).cf
  return [cf?.city, cf?.country].filter(Boolean).join(', ') || 'a place Cloudflare could not name'
}
