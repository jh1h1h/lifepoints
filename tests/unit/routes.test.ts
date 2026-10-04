import { describe, expect, it } from 'vitest'
import { appPath, href } from '../../src/utils/routes'

describe('site routes', () => {
  it('redirects the root to Points and retains nested Docs paths', () => {
    expect(appPath('/')).toBe('/points')
    expect(appPath('/docs/friends/doc123456')).toBe('/docs/friends/doc123456')
    expect(appPath('/docs/projects/doc123456')).toBe('/docs/projects/doc123456')
  })
  it('uses Vite base URL for static-hosted links', () => {
    expect(href('/docs/friends')).toBe(
      `${import.meta.env.BASE_URL.replace(/\/$/, '')}/docs/friends`,
    )
  })
})
