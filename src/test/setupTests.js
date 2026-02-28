import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// 每个测试后清理
afterEach(() => {
  cleanup()
})

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}
globalThis.localStorage = localStorageMock

// Mock fetch
globalThis.fetch = vi.fn()

// Mock DOMParser
globalThis.DOMParser = class DOMParser {
  parseFromString() {
    return {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementsByTagName: () => []
    }
  }
}
