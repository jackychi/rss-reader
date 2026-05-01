import { useRef, useState } from 'react'
import { Play, Pause, Download, X, Minus, Maximize2, Copy, Check } from 'lucide-react'
import { useAudioPlayer } from '../contexts/AudioPlayerContext'
import useAudioDrag from '../hooks/useAudioDrag'

const formatTime = (seconds) => {
  if (!seconds || !isFinite(seconds)) return '--:--'
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

export default function FloatingPlayer() {
  const {
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
    deactivatePip,
    togglePlay,
    seekToTime,
    handleProgressClick,
    cyclePlaybackRate,
  } = useAudioPlayer()

  const { position, isDragging, handleMouseDown } = useAudioDrag()
  const containerRef = useRef(null)
  const [shownotesCopied, setShownotesCopied] = useState(false)

  if (!isPipActive) return null

  const progressPercent = audioDuration ? (audioProgress / audioDuration) * 100 : 0
  const feedTitle = pipArticle?.feedTitle || pipArticle?.feed?.title || ''

  const handleCopyShownotes = () => {
    if (!pipChapters.length) return
    const text = pipChapters.map(c => `${c.label}  ${c.title}`).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setShownotesCopied(true)
      setTimeout(() => setShownotesCopied(false), 2000)
    })
  }

  const onDragStart = (e) => {
    handleMouseDown(e, containerRef.current)
  }

  if (isPipCollapsed) {
    return (
      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          zIndex: 950,
          width: '320px',
          height: '48px',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 8px 32px var(--shadow-color, rgba(0,0,0,0.15))',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 12px',
          userSelect: isDragging ? 'none' : 'auto',
          transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
        }}
      >
        {/* 拖拽区 + 标题 */}
        <div
          onMouseDown={onDragStart}
          style={{
            flex: 1,
            cursor: isDragging ? 'grabbing' : 'grab',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <button
            onClick={togglePlay}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: 'var(--accent-color)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {isPlaying ? <Pause size={12} fill="#fff" /> : <Play size={12} fill="#fff" style={{ marginLeft: '1px' }} />}
          </button>
          <span style={{
            fontSize: '12px',
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {pipArticle?.title}
          </span>
        </div>
        {/* 迷你进度 */}
        <div style={{
          width: '48px',
          height: '3px',
          backgroundColor: 'var(--border-color)',
          borderRadius: '2px',
          flexShrink: 0,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${progressPercent}%`,
            height: '100%',
            backgroundColor: 'var(--accent-color)',
            borderRadius: '2px',
          }} />
        </div>
        <button
          onClick={() => setIsPipCollapsed(false)}
          title="展开"
          style={iconBtnStyle}
        >
          <Maximize2 size={13} />
        </button>
        <button
          onClick={deactivatePip}
          title="关闭"
          style={iconBtnStyle}
        >
          <X size={13} />
        </button>
      </div>
    )
  }

  // 展开模式
  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 950,
        width: '380px',
        backgroundColor: 'var(--bg-primary)',
        borderRadius: '14px',
        border: '1px solid var(--border-color)',
        boxShadow: '0 12px 48px var(--shadow-color, rgba(0,0,0,0.2))',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: isDragging ? 'none' : 'auto',
        transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
      }}
    >
      {/* 顶栏：拖拽 + 标题 + 按钮 */}
      <div
        onMouseDown={onDragStart}
        style={{
          padding: '12px 14px 8px',
          cursor: isDragging ? 'grabbing' : 'grab',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {pipArticle?.title}
          </div>
          {feedTitle && (
            <div style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              marginTop: '2px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {feedTitle}
            </div>
          )}
        </div>
        <button
          onClick={() => setIsPipCollapsed(true)}
          title="收起"
          style={{ ...iconBtnStyle, marginTop: '1px' }}
        >
          <Minus size={14} />
        </button>
        <button
          onClick={deactivatePip}
          title="关闭"
          style={{ ...iconBtnStyle, marginTop: '1px' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* 播放控制区 */}
      <div style={{
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <button
          onClick={togglePlay}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: 'var(--accent-color)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {isPlaying ? <Pause size={16} fill="#fff" /> : <Play size={16} fill="#fff" style={{ marginLeft: '2px' }} />}
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
            <div style={{
              width: `${progressPercent}%`,
              height: '100%',
              backgroundColor: 'var(--accent-color)',
              borderRadius: '4px',
              transition: 'width 0.1s linear',
            }} />
            <div style={{
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
            }} />
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
          href={pipAudioSrc}
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

      {/* 时间轴/Shownotes */}
      {pipChapters.length > 0 && (
        <div style={{
          padding: '0 14px 12px',
        }}>
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            padding: '10px 12px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                时间轴
              </span>
              <button
                onClick={handleCopyShownotes}
                title="复制 shownotes"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 7px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: shownotesCopied ? 'var(--accent-color-dim, rgba(59,130,246,0.1))' : 'transparent',
                  color: shownotesCopied ? 'var(--accent-color)' : 'var(--text-muted)',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {shownotesCopied ? <Check size={11} /> : <Copy size={11} />}
                {shownotesCopied ? '已复制' : '复制'}
              </button>
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1px',
              maxHeight: '240px',
              overflowY: 'auto',
            }}>
              {pipChapters.map((chapter, i) => (
                <button
                  key={i}
                  onClick={() => seekToTime(chapter.time)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: 'var(--accent-color)',
                    fontWeight: 500,
                    minWidth: '40px',
                  }}>
                    {chapter.label}
                  </span>
                  <span style={{
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
        </div>
      )}
    </div>
  )
}

const iconBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: '4px',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
}
