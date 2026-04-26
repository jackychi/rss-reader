import { describe, it, expect } from 'vitest'
import { getLLMConfigFingerprint, isFeedIntroCacheValid } from '../utils/feedIntroCache'

const articles = [
  {
    guid: 'a-1',
    title: 'First article',
    pubDate: '2026-04-25T00:00:00.000Z',
  },
]

const config = {
  baseUrl: 'https://example.com/v1',
  apiKey: 'secret',
  model: 'test-model',
  contextSize: 30,
}

describe('feed intro cache validation', () => {
  it('accepts cache only when article and LLM config fingerprints both match', () => {
    const cachedIntro = {
      content: 'cached intro',
      fingerprint: 'undefined-a-1|2026-04-25T00:00:00.000Z|First article',
      configFingerprint: getLLMConfigFingerprint(config),
    }

    expect(isFeedIntroCacheValid(cachedIntro, articles, config)).toBe(true)
    expect(isFeedIntroCacheValid(cachedIntro, articles, {
      ...config,
      model: 'another-model',
    })).toBe(false)
  })

  it('rejects legacy cache entries that do not carry config fingerprint', () => {
    const cachedIntro = {
      content: 'cached intro',
      fingerprint: 'undefined-a-1|2026-04-25T00:00:00.000Z|First article',
    }

    expect(isFeedIntroCacheValid(cachedIntro, articles, config)).toBe(false)
  })
})
