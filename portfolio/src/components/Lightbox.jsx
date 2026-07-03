import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

// Full-screen image viewer with prev/next and keyboard controls.
export default function Lightbox({ items, index, onClose, onNav }) {
  const open = index !== null && index >= 0

  const handleKey = useCallback(
    (e) => {
      if (!open) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') onNav(1)
      else if (e.key === 'ArrowLeft') onNav(-1)
    },
    [open, onClose, onNav],
  )

  useEffect(() => {
    if (!open) return
    window.addEventListener('keydown', handleKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prev
    }
  }, [open, handleKey])

  const item = open ? items[index] : null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={item?.title}
        >
          <button className="lb-btn lb-close" onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
          <button
            className="lb-btn lb-prev"
            onClick={(e) => {
              e.stopPropagation()
              onNav(-1)
            }}
            aria-label="Previous"
          >
            <ChevronLeft size={30} />
          </button>
          <button
            className="lb-btn lb-next"
            onClick={(e) => {
              e.stopPropagation()
              onNav(1)
            }}
            aria-label="Next"
          >
            <ChevronRight size={30} />
          </button>

          <motion.figure
            className="lb-figure"
            key={index}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <img src={item.src} alt={item.title} />
            <figcaption>
              <em>{item.tag}</em>
              {item.title}
            </figcaption>
          </motion.figure>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
