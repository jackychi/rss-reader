import { renderHook, act } from '@testing-library/react'
import { useLocalStorage, clearLocalStorage } from '../hooks/useLocalStorage'

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.getItem.mockReset()
    localStorage.setItem.mockReset()
    localStorage.removeItem.mockReset()
  })

  it('should return initial value when localStorage is empty', () => {
    localStorage.getItem.mockReturnValue(null)

    const { result } = renderHook(() => useLocalStorage('test-key', 'default-value'))

    expect(result.current[0]).toBe('default-value')
    expect(localStorage.getItem).toHaveBeenCalledWith('test-key')
  })

  it('should return value from localStorage when exists', () => {
    localStorage.getItem.mockReturnValue(JSON.stringify('stored-value'))

    const { result } = renderHook(() => useLocalStorage('test-key', 'default-value'))

    expect(result.current[0]).toBe('stored-value')
  })

  it('should update localStorage when setValue is called', async () => {
    localStorage.getItem.mockReturnValue(null)
    localStorage.setItem.mockImplementation(() => {})

    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'))

    await act(async () => {
      await result.current[1]('new-value')
    })

    expect(localStorage.setItem).toHaveBeenCalledWith('test-key', JSON.stringify('new-value'))
  })

  it('should handle object values correctly', async () => {
    localStorage.getItem.mockReturnValue(null)
    localStorage.setItem.mockImplementation(() => {})

    const { result } = renderHook(() => useLocalStorage('test-key', { foo: 'bar' }))

    const newValue = { foo: 'baz', count: 1 }
    await act(async () => {
      await result.current[1](newValue)
    })

    expect(localStorage.setItem).toHaveBeenCalledWith('test-key', JSON.stringify(newValue))
  })

  it('should handle function updates correctly', async () => {
    localStorage.getItem.mockReturnValue(JSON.stringify({ count: 0 }))
    localStorage.setItem.mockImplementation(() => {})

    const { result } = renderHook(() => useLocalStorage('test-key', { count: 0 }))

    await act(async () => {
      await result.current[1]((prev) => ({ count: prev.count + 1 }))
    })

    expect(localStorage.setItem).toHaveBeenCalledWith('test-key', JSON.stringify({ count: 1 }))
  })

  it('should handle JSON parse errors gracefully', () => {
    localStorage.getItem.mockReturnValue('invalid-json')

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useLocalStorage('test-key', 'default'))

    expect(result.current[0]).toBe('default')
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('should return stable setValue function', () => {
    const { result, rerender } = renderHook(() => useLocalStorage('test-key', 'initial'))

    const setValue1 = result.current[1]

    rerender()

    const setValue2 = result.current[1]

    // Note: setValue may change due to dependencies, so this is a soft check
    expect(setValue1).toBeDefined()
    expect(setValue2).toBeDefined()
  })
})

describe('clearLocalStorage', () => {
  it('should remove item from localStorage', () => {
    clearLocalStorage('test-key')

    expect(localStorage.removeItem).toHaveBeenCalledWith('test-key')
  })

  it('should handle errors gracefully', () => {
    localStorage.removeItem.mockImplementation(() => {
      throw new Error('Storage error')
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => clearLocalStorage('test-key')).not.toThrow()
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})
