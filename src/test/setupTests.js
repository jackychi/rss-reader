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
global.localStorage = localStorageMock

// Mock fetch
global.fetch = vi.fn()

// Mock DOMParser
global.DOMParser = class DOMParser {
  parseFromString(str, contentType) {
    return {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementsByTagName: () => []
    }
  }
}
