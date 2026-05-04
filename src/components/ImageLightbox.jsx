import { useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

export default function ImageLightbox({ images, currentIndex, onClose }) {
  const [index, setIndex] = useState(currentIndex)
  const count = images.length
  const hasPrev = index > 0
  const hasNext = index < count - 1

  const goPrev = useCallback(() => { if (hasPrev) setIndex(i => i - 1) }, [hasPrev])
  const goNext = useCallback(() => { if (hasNext) setIndex(i => i + 1) }, [hasNext])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, goPrev, goNext])

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div className="lightbox-header">
        {count > 1 && <span className="lightbox-counter">{index + 1} / {count}</span>}
        <button className="lightbox-close" onClick={onClose}><X size={20} /></button>
      </div>

      <img
        src={images[index]}
        className="lightbox-image"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      {hasPrev && (
        <button className="lightbox-arrow lightbox-arrow-left" onClick={(e) => { e.stopPropagation(); goPrev() }}>
          <ChevronLeft size={28} />
        </button>
      )}
      {hasNext && (
        <button className="lightbox-arrow lightbox-arrow-right" onClick={(e) => { e.stopPropagation(); goNext() }}>
          <ChevronRight size={28} />
        </button>
      )}
    </div>
  )
}
