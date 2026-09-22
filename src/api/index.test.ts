import { describe, expect, it } from 'vitest'
import { projectUrl } from './index'

/**
 * Supabase shows the project address in several places — Settings → API gives
 * the bare origin, the REST panel gives it with `/rest/v1/` on the end. The
 * client appends that path itself, so a pasted URL carrying it would produce
 * `/rest/v1/rest/v1/rpc/…` and every call would 404. Whatever is pasted in is
 * trimmed back to the origin.
 */
describe('the project address', () => {
  it('takes the origin, whatever was pasted in', () => {
    for (const given of [
      'https://abc.supabase.co',
      'https://abc.supabase.co/',
      'https://abc.supabase.co/rest/v1',
      'https://abc.supabase.co/rest/v1/',
      '  https://abc.supabase.co/auth/v1/  ',
    ]) {
      expect(projectUrl(given), given).toBe('https://abc.supabase.co')
    }
  })

  it('treats nothing as nothing, so the app falls back to the local build', () => {
    expect(projectUrl(undefined)).toBeUndefined()
    expect(projectUrl('')).toBeUndefined()
    expect(projectUrl('   ')).toBeUndefined()
  })
})
