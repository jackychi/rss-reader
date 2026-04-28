import { describe, it, expect, vi, afterEach } from 'vitest'
import { callLLM } from '../utils/askCat'

const validConfig = {
  baseUrl: 'https://example.com/v1',
  apiKey: 'test-key',
  model: 'test-model',
}

describe('callLLM', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rethrows AbortError so the UI can treat stop as a cancel, not a network failure', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError)

    await expect(callLLM([{ role: 'user', content: 'hi' }], validConfig)).rejects.toMatchObject({
      name: 'AbortError',
      message: 'The operation was aborted.',
    })
  })
})
