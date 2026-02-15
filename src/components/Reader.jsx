import { useState, useEffect, useRef } from 'react'
import { X, ChevronRight, ExternalLink, FileText, Play, Pause, Download, Maximize2, Minimize2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

/**
 * Reader 组件 - 右侧文章阅读器
 * 支持：字体大小调节、音频播放、原文跳转、位置记忆、全屏阅读
 */
export default function Reader({
  selectedArticle,
  readerVisible,
  onClose,
  showOriginal,
  onToggleOriginal,
  getArticleContent,
  getArticleAudio,
  formatDate,
  fontSize,
  onFontSizeChange,
  initialReadPosition = 0,
  initialAudioPosition = 0,
  onUpdateReadPosition,
  onUpdateAudioPosition,
  isFullscreen = false,
  onToggleFullscreen
}) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioProgress, setAudioProgress] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const audioRef = useRef(null)
  const contentRef = useRef(null)
  const scrollTimeoutRef = useRef(null)
  const lastSavedTimeRef = useRef(0)  // 上次记录的时间

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
  }, [selectedArticle?.guid])

  // 清理音频状态并恢复播放位置
  useEffect(() => {
    setIsPlaying(false)
    setAudioProgress(initialAudioPosition)
    setAudioDuration(0)
    setPlaybackRate(1)
    lastSavedTimeRef.current = 0  // 重置记录时间
  }, [selectedArticle?.guid])

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

  // 清理滚动超时
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
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
    const plainText = stripHtml(content)
    const chapterRegex = /\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?/g
    const chapters = []
    let match

    while ((match = chapterRegex.exec(plainText)) !== null) {
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

      // 获取时间戳后面的文字作为章节标题
      const afterMatch = plainText.substring(match.index + match[0].length).trim()
      const titleMatch = afterMatch.match(/^[\s\-\.\:]*([^\n]{1,60})/)
      const title = titleMatch ? titleMatch[1].replace(/^[\s\-\.\:]+/, '').trim() : ''

      chapters.push({
        time: totalSeconds,
        label: match[0].replace(/[\[\]]/g, ''),
        title: title || '章节 ' + (chapters.length + 1)
      })
    }

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
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{selectedArticle.feedTitle}</span>
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
              <a
                href={selectedArticle.link}
                target="_blank"
                rel="noopener noreferrer"
                className="original-link"
                style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-color)', textDecoration: 'none', fontSize: '13px' }}
              >
                Original
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {showOriginal && selectedArticle.link ? (
              <iframe
                src={selectedArticle.link}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Original Article"
              />
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
                          const currentTime = audioRef.current?.currentTime || 0
                          setAudioProgress(currentTime)
                          // 记录音频位置（每5秒记录一次）
                          if (currentTime > 0 && currentTime - lastSavedTimeRef.current >= 5 && onUpdateAudioPosition) {
                            lastSavedTimeRef.current = currentTime
                            onUpdateAudioPosition(currentTime)
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
                        fontSize: '12px',
                        fontWeight: '600',
                        color: 'var(--text-secondary)',
                        marginBottom: '8px',
                      }}>
                        时间轴
                      </div>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        maxHeight: '200px',
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
          <FileText size={64} style={{ opacity: 0.2, marginBottom: '16px' }} />
          <p style={{ color: 'var(--text-muted)' }}>Select an article to read</p>
        </div>
      )}
    </section>
  )
}
