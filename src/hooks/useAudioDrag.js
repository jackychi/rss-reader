import { useState, useRef, useEffect, useCallback } from 'react'

export default function useAudioDrag(initialPosition = null) {
  const [position, setPosition] = useState(
    initialPosition || { x: window.innerWidth - 404, y: window.innerHeight - 500 }
  )
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const elementSize = useRef({ w: 380, h: 460 })

  const clamp = useCallback((pos) => {
    const maxX = window.innerWidth - elementSize.current.w - 8
    const maxY = window.innerHeight - elementSize.current.h - 8
    return {
      x: Math.max(8, Math.min(pos.x, maxX)),
      y: Math.max(8, Math.min(pos.y, maxY)),
    }
  }, [])

  const handleMouseDown = useCallback((e, el) => {
    if (e.button !== 0) return
    e.preventDefault()
    if (el) {
      const rect = el.getBoundingClientRect()
      elementSize.current = { w: rect.width, h: rect.height }
    }
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    setIsDragging(true)
  }, [position])

  useEffect(() => {
    if (!isDragging) return

    const onMove = (e) => {
      setPosition(clamp({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      }))
    }
    const onUp = () => setIsDragging(false)

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [isDragging, clamp])

  useEffect(() => {
    const onResize = () => setPosition((prev) => clamp(prev))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp])

  return { position, isDragging, handleMouseDown }
}
