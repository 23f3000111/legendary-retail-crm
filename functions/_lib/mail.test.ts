import { describe, expect, it } from 'vitest'
import { FROM, sendAlert } from './mail'

const env = { RESEND_API_KEY: 're_test', ALERT_EMAILS: 'dev@example.com, davy@example.com ,info@example.com', ALERT_REPLY_TO: 'dev@example.com' }

describe('the alert email', () => {
  it('sends to every alert address with the reply-to set, and carries nothing it was not given', async () => {
    const sent: { url: string; init: RequestInit }[] = []
    const fetchFn = (async (url: string, init: RequestInit) => {
      sent.push({ url, init })
      return new Response('{"id":"x"}', { status: 200 })
    }) as unknown as typeof fetch

    await sendAlert(env, 'Backups page opened', 'At 10:02 from Kuala Lumpur, MY.', fetchFn)

    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('https://api.resend.com/emails')
    expect(sent[0].init.method).toBe('POST')
    expect((sent[0].init.headers as Record<string, string>).authorization).toBe('Bearer re_test')
    expect(JSON.parse(String(sent[0].init.body))).toEqual({
      from: FROM,
      to: ['dev@example.com', 'davy@example.com', 'info@example.com'],
      reply_to: 'dev@example.com',
      subject: 'Backups page opened',
      text: 'At 10:02 from Kuala Lumpur, MY.',
    })
    expect(FROM).toBe('Legendary CRM backups <backups@legendary.com.my>')
  })

  it('a failed send does not throw', async () => {
    const down = (async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    const refused = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch
    await expect(sendAlert(env, 's', 't', down)).resolves.toBeUndefined()
    await expect(sendAlert(env, 's', 't', refused)).resolves.toBeUndefined()
  })
})
