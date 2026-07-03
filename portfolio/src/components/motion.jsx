import { motion, useInView, useMotionValue, useSpring, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

// Reusable scroll-reveal wrapper with a staggered fade-and-rise.
export function Reveal({ children, delay = 0, y = 26, className, as = 'div' }) {
  const reduce = useReducedMotion()
  const MotionTag = motion[as] || motion.div
  return (
    <MotionTag
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -80px 0px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  )
}

// Container that staggers its direct <Reveal>/motion children.
export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
}
export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
}

// Count-up number that animates when scrolled into view.
export function Counter({ to, suffix = '', duration = 1.6 }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -60px 0px' })
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(reduce ? to : 0)

  useEffect(() => {
    if (!inView || reduce) return
    let raf
    const start = performance.now()
    const tick = (now) => {
      const p = Math.min((now - start) / (duration * 1000), 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(eased * to))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, to, duration, reduce])

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  )
}

export { motion }
