import { useState, useEffect, useMemo, useRef } from 'react'
import { X, ChevronRight, ExternalLink, FileText, Play, Pause, Download, Maximize2, Minimize2, Bookmark, BookmarkCheck, Rss, MoreHorizontal, Copy, Check, Send } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

function addCJKSpacing(text) {
  if (!text) return text
  return text
    .replace(/([\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff])/g, '$1 $2')
}

function renderFeedIntroHTML(content) {
  const html = marked.parse(addCJKSpacing(content || ''), { breaks: false, gfm: true })
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel'],
  }).replace(
    /<a([^>]*?)href="(https?:\/\/[^"]+)"([^>]*?)>/g,
    '<a$1href="$2"$3 target="_blank" rel="noopener noreferrer">'
  )
}

/**
 * OriginalMenu - iframe 原文工具栏的三点下拉菜单
 */
function OriginalMenu({ link }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  const handleCopy = async (e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(link || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be unavailable in restricted browser contexts.
    }
    setMenuOpen(false)
  }

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setMenuOpen(v => !v)}
        style={{
          padding: '6px', borderRadius: '6px', border: 'none',
          backgroundColor: menuOpen ? 'var(--bg-tertiary)' : 'transparent',
          color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex',
          alignItems: 'center', transition: 'background-color 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
        onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        <MoreHorizontal size={18} />
      </button>
      {menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: '4px',
            backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)',
            borderRadius: '8px', boxShadow: '0 4px 12px var(--shadow-color)',
            minWidth: '160px', padding: '4px', zIndex: 100,
          }}
        >
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              width: '100%', padding: '8px 12px', borderRadius: '4px',
              textDecoration: 'none', color: 'var(--text-primary)',
              fontSize: '13px', cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ExternalLink size={14} />
            <span>在新标签页打开</span>
          </a>
          <button
            onClick={handleCopy}
            style={{
              width: '100%', padding: '8px 12px', border: 'none', backgroundColor: 'transparent',
              color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px',
              display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '4px', textAlign: 'left',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? '已复制' : '复制链接'}</span>
          </button>
          <button
            disabled
            title="即将推出"
            style={{
              width: '100%', padding: '8px 12px', border: 'none', backgroundColor: 'transparent',
              color: 'var(--text-muted)', cursor: 'not-allowed', fontSize: '13px',
              display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '4px', textAlign: 'left', opacity: 0.5,
            }}
          >
            <Send size={14} />
            <span>转发到墨问</span>
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Reader 组件 - 右侧文章阅读器
 * 支持：字体大小调节、音频播放、原文跳转、位置记忆、全屏阅读
 */
export default function Reader({
  selectedArticle,
  onClose,
  showOriginal,
  onToggleOriginal,
  getArticleContent,
  getArticleAudio,
  fontSize,
  onFontSizeChange,
  initialReadPosition = 0,
  initialAudioPosition = 0,
  onUpdateReadPosition,
  onUpdateAudioPosition,
  isFullscreen = false,
  onToggleFullscreen,
  isInReadingList = false,
  onToggleReadingList,
  onNavigateToFeed,
  selectedFeed = null,
  feedIntro = '',
  feedIntroStatus = 'idle',
  feedIntroError = null,
  onOpenAskCatSettings
}) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioProgress, setAudioProgress] = useState(initialAudioPosition)
  const [audioDuration, setAudioDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const audioRef = useRef(null)
  const contentRef = useRef(null)
  const scrollTimeoutRef = useRef(null)
  const lastSavedTimeRef = useRef(0)  // 上次记录的时间
  const progressRAFRef = useRef(null)  // requestAnimationFrame ID
  const saveTimerRef = useRef(null)  // 延迟保存定时器
  const feedIntroHTML = useMemo(() => renderFeedIntroHTML(feedIntro), [feedIntro])

  // 恢复阅读滚动位置
  useEffect(() => {
    if (contentRef.current && initialReadPosition > 0) {
      // 延迟执行确保内容已渲染
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.scrollTop = initialReadPosition
        }
      }, 100)
    }
  }, [selectedArticle?.guid, initialReadPosition])

  // 恢复音频播放位置
  useEffect(() => {
    if (audioRef.current && initialAudioPosition > 0) {
      audioRef.current.currentTime = initialAudioPosition
    }
  }, [selectedArticle?.guid, initialAudioPosition])

  // 同步播放速率
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
    }
  }, [playbackRate])

  // 记录滚动阅读位置（防抖）
  const handleScroll = () => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = setTimeout(() => {
      if (contentRef.current && onUpdateReadPosition) {
        onUpdateReadPosition(contentRef.current.scrollTop)
      }
    }, 500)
  }

  // 清理定时器和 rAF
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
      if (progressRAFRef.current) cancelAnimationFrame(progressRAFRef.current)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // 格式化时间
  const formatTime = (seconds) => {
    if (!seconds || !isFinite(seconds)) return '--:--'
    return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
  }

  // 切换播放/暂停
  const togglePlay = () => {
    if (!audioRef.current) return
    if (audioRef.current.paused) {
      audioRef.current.play()
    } else {
      audioRef.current.pause()
    }
  }

  // 切换播放速率
  const cyclePlaybackRate = () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2]
    const currentIndex = rates.indexOf(playbackRate)
    const nextIndex = (currentIndex + 1) % rates.length
    setPlaybackRate(rates[nextIndex])
  }

  // 调整进度
  const handleProgressClick = (e) => {
    if (!audioRef.current || !audioDuration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    audioRef.current.currentTime = percent * audioDuration
  }

  // 跳转到指定时间点
  const seekToTime = (seconds) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = seconds
    if (!isPlaying) {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  // 去除HTML标签的工具函数
  const stripHtml = (html) => {
    if (!html) return ''
    return html
      .replace(/<[^>]*>/g, '')  // 移除HTML标签
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
  }

  // 解析时间轴章节 - 支持多种格式: [01:23], 01:23, 01:23:45, 1:23:45
  const parseChapters = (content) => {
    if (!content) return []
    // 先去除HTML标签
    const plainText = stripHtml(content).replace(/\r\n/g, '\n')
    const chapterRegex = /\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?/g
    const chapters = []
    const matches = Array.from(plainText.matchAll(chapterRegex))

    matches.forEach((match, index) => {
      const hours = parseInt(match[1], 10)
      const minutes = parseInt(match[2], 10)
      const seconds = match[3] ? parseInt(match[3], 10) : 0

      // 计算总秒数 - 判断是 HH:MM:SS 还是 MM:SS 格式
      let totalSeconds
      if (hours < 60) {
        totalSeconds = hours * 60 + minutes
        if (match[3]) {
          totalSeconds = hours * 3600 + minutes * 60 + seconds
        }
      } else {
        totalSeconds = hours * 60 + minutes
      }

      // 标题只取“当前时间戳之后，到下一个时间戳之前”的片段
      const currentEnd = (match.index ?? 0) + match[0].length
      const nextStart = matches[index + 1]?.index ?? plainText.length
      const rawTitle = plainText
        .slice(currentEnd, nextStart)
        .replace(/\s+/g, ' ')
        .replace(/^[\s\-.:，,|]+/, '')
        .trim()
      const title = rawTitle.slice(0, 60)

      chapters.push({
        time: totalSeconds,
        label: match[0].replace(/\[|\]/g, ''),
        title: title || '章节 ' + (chapters.length + 1)
      })
    })

    // 去重并按时间排序
    const uniqueChapters = chapters.filter((c, i, arr) =>
      i === 0 || c.time !== arr[i - 1].time
    ).sort((a, b) => a.time - b.time)

    return uniqueChapters
  }

  const audioSrc = selectedArticle ? getArticleAudio(selectedArticle) : null

  // 获取文章内容中的章节
  const chapters = audioSrc && selectedArticle ? parseChapters(
    selectedArticle.content || selectedArticle['content:encoded'] || ''
  ) : []

  // 复制 shownotes
  const [shownotesCopied, setShownotesCopied] = useState(false)
  const handleCopyShownotes = async (e) => {
    e.stopPropagation()
    try {
      const text = chapters.map(c => `${c.label} ${c.title}`).join('\n')
      await navigator.clipboard.writeText(text)
      setShownotesCopied(true)
      setTimeout(() => setShownotesCopied(false), 1500)
    } catch {
      // Clipboard can be unavailable in restricted browser contexts.
    }
  }

  return (
    <section className={`reader flex-1 overflow-hidden flex flex-col ${isFullscreen ? 'fullscreen-reader' : ''}`}>
      {selectedArticle ? (
        <>
          <div className="reader-header p-4 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <div className="flex items-center gap-2">
              {showOriginal ? (
                <button
                  onClick={() => onToggleOriginal(false)}
                  style={{ padding: '6px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} />
                </button>
              ) : (
                <button
                  onClick={onClose}
                  style={{ padding: '6px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              )}
              <button
                onClick={() => onNavigateToFeed?.(selectedArticle)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '2px 6px',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
                title="进入专栏"
              >
                <Rss size={11} style={{ color: '#ff9500', flexShrink: 0 }} />
                {selectedArticle.feedTitle}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* 字体大小调节 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '8px' }}>
                <button
                  onClick={() => onFontSizeChange(Math.max(12, fontSize - 2))}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                  title="减小字体"
                >
                  A-
                </button>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '24px', textAlign: 'center' }}>
                  {fontSize}
                </span>
                <button
                  onClick={() => onFontSizeChange(Math.min(24, fontSize + 2))}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                  title="增大字体"
                >
                  A+
                </button>
              </div>
              {/* 全屏按钮 */}
              <button
                onClick={onToggleFullscreen}
                style={{
                  padding: '6px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={isFullscreen ? "退出全屏" : "全屏阅读"}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              {/* 阅读列表按钮 */}
              <button
                onClick={onToggleReadingList}
                style={{
                  padding: '6px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: isInReadingList ? 'var(--accent-color)' : 'var(--bg-tertiary)',
                  color: isInReadingList ? '#ffffff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={isInReadingList ? "从阅读列表移除" : "添加到阅读列表"}
              >
                {isInReadingList ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
              </button>
              <OriginalMenu link={selectedArticle.link} />
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {showOriginal && selectedArticle.link ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 16px', borderBottom: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-tertiary)', flexShrink: 0,
                }}>
                  <button
                    onClick={() => onToggleOriginal(false)}
                    style={{
                      padding: '4px 12px', borderRadius: '6px',
                      border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px',
                    }}
                  >
                    ← 返回
                  </button>
                  <a
                    href={selectedArticle.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '4px 12px', borderRadius: '6px',
                      backgroundColor: 'var(--accent-color)', color: '#fff',
                      textDecoration: 'none', fontSize: '13px', fontWeight: 600,
                    }}
                  >
                    在新标签页打开
                    <ExternalLink size={13} />
                  </a>
                </div>
                <iframe
                  src={selectedArticle.link}
                  style={{ width: '100%', flex: 1, border: 'none' }}
                  title="Original Article"
                />
              </div>
            ) : (
              <div
                ref={contentRef}
                className="overflow-y-auto"
                style={{ height: '100%' }}
                onScroll={handleScroll}
              >
                <article style={{ maxWidth: '720px', margin: '0 auto', padding: '32px' }}>
                  <h1
                    className="reader-title"
                    style={{ cursor: 'pointer', fontSize: `${fontSize + 8}px`, fontWeight: 700, lineHeight: 1.3, marginBottom: '12px' }}
                    onClick={() => selectedArticle.link && onToggleOriginal(true)}
                    title="Click to open original article"
                  >
                    {selectedArticle.title}
                  </h1>

                  {/* 发表时间和查看原文 - 有播放器时放标题下面 */}
                  {audioSrc && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <span className="reader-date">{formatDistanceToNow(new Date(selectedArticle.isoDate), { addSuffix: true, locale: zhCN })}</span>
                      {selectedArticle.link && (
                        <button
                          onClick={() => onToggleOriginal(true)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-color)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            padding: '4px 8px',
                            borderRadius: '4px',
                          }}
                        >
                          查看原文
                        </button>
                      )}
                    </div>
                  )}

                  {/* 音频播放器 */}
                  {audioSrc && (
                    <div
                      className="custom-audio-player"
                      style={{
                        marginTop: '16px',
                        marginBottom: '20px',
                        padding: '12px 16px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <audio
                        ref={audioRef}
                        src={audioSrc}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => {
                          setIsPlaying(false)
                          // 暂停时记录位置
                          if (audioRef.current?.currentTime && onUpdateAudioPosition) {
                            onUpdateAudioPosition(audioRef.current.currentTime)
                          }
                        }}
                        onTimeUpdate={() => {
                          // 用 rAF 合并进度更新，避免每 250ms 都触发 re-render
                          if (!progressRAFRef.current) {
                            progressRAFRef.current = requestAnimationFrame(() => {
                              progressRAFRef.current = null
                              const currentTime = audioRef.current?.currentTime || 0
                              setAudioProgress(currentTime)
                            })
                          }
                          // 记录音频位置（每30秒持久化一次，减少 localStorage 写入）
                          const currentTime = audioRef.current?.currentTime || 0
                          if (currentTime > 0 && currentTime - lastSavedTimeRef.current >= 30 && onUpdateAudioPosition) {
                            lastSavedTimeRef.current = currentTime
                            // 用 setTimeout 将 localStorage 写入推到下一个宏任务，不阻塞音频解码
                            clearTimeout(saveTimerRef.current)
                            saveTimerRef.current = setTimeout(() => onUpdateAudioPosition(currentTime), 0)
                          }
                        }}
                        onLoadedMetadata={() => setAudioDuration(audioRef.current?.duration || 0)}
                      />
                      <button
                        onClick={togglePlay}
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          border: 'none',
                          backgroundColor: 'var(--accent-color)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        {isPlaying ? <Pause size={16} fill="#ffffff" /> : <Play size={16} fill="#ffffff" style={{ marginLeft: '2px' }} />}
                      </button>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          className="audio-progress"
                          style={{
                            flex: 1,
                            height: '8px',
                            backgroundColor: 'var(--border-color)',
                            borderRadius: '4px',
                            overflow: 'visible',
                            cursor: 'pointer',
                            position: 'relative',
                          }}
                          onClick={handleProgressClick}
                        >
                          <div
                            style={{
                              width: audioDuration ? `${(audioProgress / audioDuration) * 100}%` : '0%',
                              height: '100%',
                              backgroundColor: 'var(--accent-color)',
                              borderRadius: '4px',
                              transition: 'width 0.1s linear',
                            }}
                          />
                          {/* 进度头 */}
                          <div
                            style={{
                              position: 'absolute',
                              right: '-6px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '12px',
                              height: '12px',
                              backgroundColor: 'var(--accent-color)',
                              borderRadius: '50%',
                              border: '2px solid var(--bg-primary)',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                              opacity: audioDuration ? 1 : 0,
                              transition: 'opacity 0.2s ease',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0, minWidth: '36px' }}>
                          {formatTime(audioProgress)}/{formatTime(audioDuration)}
                        </span>
                      </div>
                      <button
                        onClick={cyclePlaybackRate}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        {playbackRate}x
                      </button>
                      <a
                        href={audioSrc}
                        download
                        title="下载音频"
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          cursor: 'pointer',
                          textDecoration: 'none',
                          flexShrink: 0,
                        }}
                      >
                        <Download size={14} />
                      </a>
                    </div>
                  )}

                  {/* 时间轴章节列表 */}
                  {chapters.length > 0 && (
                    <div
                      style={{
                        marginTop: '12px',
                        marginBottom: '20px',
                        padding: '12px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '8px',
                      }}>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: '600',
                          color: 'var(--text-secondary)',
                        }}>
                          时间轴
                        </span>
                        <button
                          onClick={handleCopyShownotes}
                          title="复制 shownotes"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: shownotesCopied ? 'var(--accent-color-dim, rgba(59,130,246,0.1))' : 'transparent',
                            color: shownotesCopied ? 'var(--accent-color)' : 'var(--text-muted)',
                            fontSize: '11px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (!shownotesCopied) e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                          }}
                          onMouseLeave={(e) => {
                            if (!shownotesCopied) e.currentTarget.style.backgroundColor = 'transparent'
                          }}
                        >
                          {shownotesCopied ? <Check size={12} /> : <Copy size={12} />}
                          {shownotesCopied ? '已复制' : '复制'}
                        </button>
                      </div>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        maxHeight: '340px',
                        overflowY: 'auto',
                      }}>
                        {chapters.map((chapter, index) => (
                          <button
                            key={index}
                            onClick={() => seekToTime(chapter.time)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 10px',
                              borderRadius: '4px',
                              border: 'none',
                              backgroundColor: 'transparent',
                              color: 'var(--text-primary)',
                              fontSize: '13px',
                              cursor: 'pointer',
                              textAlign: 'left',
                              transition: 'background-color 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                            }}
                          >
                            <span style={{
                              fontFamily: 'monospace',
                              fontSize: '12px',
                              color: 'var(--accent-color)',
                              fontWeight: '500',
                              minWidth: '45px',
                            }}>
                              {chapter.label}
                            </span>
                            <span style={{
                              color: 'var(--text-primary)',
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {chapter.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 文章元信息 - 无播放器时显示 */}
                  {!audioSrc && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                      <span className="reader-date">{formatDistanceToNow(new Date(selectedArticle.isoDate), { addSuffix: true, locale: zhCN })}</span>
                      {selectedArticle.link && (
                        <button
                          onClick={() => onToggleOriginal(true)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-color)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            padding: '4px 8px',
                            borderRadius: '4px',
                          }}
                        >
                          查看原文
                        </button>
                      )}
                    </div>
                  )}

                  {/* 文章内容 - 可调节字体大小 */}
                  <div
                    className="reader-content"
                    dangerouslySetInnerHTML={{ __html: getArticleContent(selectedArticle) }}
                    style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}
                  />
                </article>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="reader-empty-state">
          {selectedFeed?.title ? (
            <div className="feed-intro-card">
              <div className="feed-intro-kicker">
                <Rss size={16} />
                <span>栏目介绍</span>
              </div>
              <h2 className="feed-intro-title">{selectedFeed.title}</h2>

              {feedIntroStatus === 'loading' && (
                <div className="feed-intro-loading">
                  <span className="feed-intro-spinner" />
                  <span>正在分析这个栏目最近的内容...</span>
                </div>
              )}

              {feedIntroStatus === 'ready' && feedIntro && (
                <div
                  className="feed-intro-content"
                  dangerouslySetInnerHTML={{ __html: feedIntroHTML }}
                />
              )}

              {feedIntroStatus === 'unconfigured' && (
                <div className="feed-intro-hint">
                  <p>配置 Ask Cat 的大模型后，点击订阅源会自动生成栏目介绍。</p>
                  <button type="button" onClick={onOpenAskCatSettings}>
                    打开 Ask Cat 设置
                  </button>
                </div>
              )}

              {feedIntroStatus === 'empty' && (
                <p className="feed-intro-muted">这个栏目还没有可分析的缓存文章，刷新或等待文章加载后再试。</p>
              )}

              {feedIntroStatus === 'error' && (
                <p className="feed-intro-muted">栏目介绍生成失败：{feedIntroError}</p>
              )}
            </div>
          ) : (
            <>
              <FileText size={64} style={{ opacity: 0.2, marginBottom: '16px' }} />
              <p style={{ color: 'var(--text-muted)' }}>Select an article to read</p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
