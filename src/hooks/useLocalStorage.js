import { useState, useEffect, useCallback } from 'react'

/**
 * 本地存储 Hook - 管理数据的持久化
 * @param {string} key - localStorage 键名
 * @param {any} initialValue - 初始值（当 localStorage 中无数据时使用）
 */
export function useLocalStorage(key, initialValue) {
  // 获取初始值：优先从 localStorage 读取，否则使用默认值
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error)
      return initialValue
    }
  })

  // 更新 localStorage 的包装函数
  const setValue = useCallback((value) => {
    try {
      // 支持函数形式的值（如 setState）
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)
      localStorage.setItem(key, JSON.stringify(valueToStore))
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error)
    }
  }, [key, storedValue])

  return [storedValue, setValue]
}

/**
 * 清除指定 localStorage 项
 */
export function clearLocalStorage(key) {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.error(`Error clearing localStorage key "${key}":`, error)
  }
}
