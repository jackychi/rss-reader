import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { getArticleKey } from '../utils/articleKey'

const AudioPlayerContext = createContext(null)

export function useAudioPlayer() {
  const ctx = useContext(AudioPlayerContext)
  if (!ctx) throw new Error('useAudioPlayer must be used within AudioPlayerProvider')
  return ctx
}

export function AudioPlayerProvider({ children, onUpdateAudioPosition }) {
  const [pipArticle, setPipArticle] = useState(null)
  const [pipAudioSrc, setPipAudioSrc] = useState(null)
  const [pipChapters, setPipChapters] = useState([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioProgress, setAudioProgress] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isPipCollapsed, setIsPipCollapsed] = useState(false)

  const audioRef = useRef(null)
  const progressRAFRef = useRef(null)
  const lastSavedTimeRef = useRef(0)
  const saveTimerRef = useRef(null)
  const pipArticleRef = useRef(null)

  useEffect(() => {
    pipArticleRef.current = pipArticle
  }, [pipArticle])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
    }
  }, [playbackRate])

  const isPipActive = pipArticle !== null

  const isPipPlayingArticle = useCallback((article) => {
    if (!article || !pipArticleRef.current) return false
    return getArticleKey(article) === getArticleKey(pipArticleRef.current)
  }, [])

  const activatePip = useCallback((article, audioSrc, chapters, currentTime, rate, collapsed = false) => {
    setPipArticle(article)
    setPipAudioSrc(audioSrc)
    setPipChapters(chapters || [])
    setAudioProgress(currentTime || 0)
    setPlaybackRate(rate || 1)
    setIsPipCollapsed(collapsed)
    lastSavedTimeRef.current = currentTime || 0

    requestAnimationFrame(() => {
      const el = audioRef.current
      if (!el) return
      el.src = audioSrc
      el.playbackRate = rate || 1
      el.currentTime = currentTime || 0
      el.play().catch(() => {})
    })
  }, [])

  const deactivatePip = useCallback(() => {
    const el = audioRef.current
    if (el && pipArticleRef.current && onUpdateAudioPosition) {
      onUpdateAudioPosition(pipArticleRef.current, el.currentTime)
    }
    if (el) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    setPipArticle(null)
    setPipAudioSrc(null)
    setPipChapters([])
    setIsPlaying(false)
    setAudioProgress(0)
    setAudioDuration(0)
    lastSavedTimeRef.current = 0
  }, [onUpdateAudioPosition])

  const togglePlay = useCallback(() => {
    const el = audioRef.current
    if (!el || !pipAudioSrc) return
    if (el.paused) {
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }, [pipAudioSrc])

  const seekToTime = useCallback((seconds) => {
    const el = audioRef.current
    if (!el) return
    el.currentTime = seconds
    setAudioProgress(seconds)
    if (el.paused) {
      el.play().catch(() => {})
    }
  }, [])

  const handleProgressClick = useCallback((e) => {
    const el = audioRef.current
    if (!el || !audioDuration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    el.currentTime = percent * audioDuration
    setAudioProgress(el.currentTime)
  }, [audioDuration])

  const cyclePlaybackRate = useCallback(() => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2]
    setPlaybackRate((prev) => {
      const idx = rates.indexOf(prev)
      return rates[(idx + 1) % rates.length]
    })
  }, [])

  const onAudioPlay = useCallback(() => setIsPlaying(true), [])

  const onAudioPause = useCallback(() => {
    setIsPlaying(false)
    if (audioRef.current?.currentTime && pipArticleRef.current && onUpdateAudioPosition) {
      onUpdateAudioPosition(pipArticleRef.current, audioRef.current.currentTime)
    }
  }, [onUpdateAudioPosition])

  const onAudioTimeUpdate = useCallback(() => {
    if (!progressRAFRef.current) {
      progressRAFRef.current = requestAnimationFrame(() => {
        progressRAFRef.current = null
        const t = audioRef.current?.currentTime || 0
        setAudioProgress(t)
      })
    }
    const t = audioRef.current?.currentTime || 0
    if (t > 0 && t - lastSavedTimeRef.current >= 30 && pipArticleRef.current && onUpdateAudioPosition) {
      lastSavedTimeRef.current = t
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        if (pipArticleRef.current) onUpdateAudioPosition(pipArticleRef.current, t)
      }, 0)
    }
  }, [onUpdateAudioPosition])

  const onAudioLoadedMetadata = useCallback(() => {
    setAudioDuration(audioRef.current?.duration || 0)
  }, [])

  const value = {
    pipArticle,
    pipAudioSrc,
    pipChapters,
    isPlaying,
    audioProgress,
    audioDuration,
    playbackRate,
    isPipActive,
    isPipCollapsed,
    setIsPipCollapsed,
    isPipPlayingArticle,
    activatePip,
    deactivatePip,
    togglePlay,
    seekToTime,
    handleProgressClick,
    cyclePlaybackRate,
  }

  return (
    <AudioPlayerContext.Provider value={value}>
      <audio
        ref={audioRef}
        style={{ display: 'none' }}
        onPlay={onAudioPlay}
        onPause={onAudioPause}
        onTimeUpdate={onAudioTimeUpdate}
        onLoadedMetadata={onAudioLoadedMetadata}
      />
      {children}
    </AudioPlayerContext.Provider>
  )
}
