import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { DUR, EASE_OUT } from '../lib/motion';

/**
 * A rotating line of quotations about ideas.
 *
 * TWO THINGS DECIDE HOW THIS BEHAVES.
 *
 * 1. ACCESSIBILITY. Content that updates itself every four seconds is exactly
 *    what WCAG 2.2.2 is about: anything auto-updating for longer than five
 *    seconds needs a way to pause it. This pauses on hover and on keyboard
 *    focus, and under `prefers-reduced-motion` it does not rotate at all — it
 *    shows one quote and stays there. The region is `aria-live="off"` on
 *    purpose: a live region that re-announces every four seconds makes a
 *    screen reader unusable, and the quote is supporting material, not the
 *    page's message.
 *
 * 2. ATTRIBUTION. Every line below is one I could attribute with reasonable
 *    confidence. Several famous "innovation" quotes are misattributed in
 *    circulation — Ford's "faster horses" and da Vinci's "simplicity is the
 *    ultimate sophistication" are the two best known — and they are left out
 *    rather than printed under a name that probably never said them. On a
 *    product whose one rule is that claims carry their source, the quote wall
 *    is not the place to relax it.
 */
export interface Quote { text: string; author: string; role?: string }

export const QUOTES: Quote[] = [
  { text: 'The value of an idea lies in the using of it.', author: 'Thomas Edison', role: 'co-founder of General Electric' },
  { text: 'All cost is for function.', author: 'Lawrence D. Miles', role: 'creator of value engineering, 1947' },
  { text: 'The best way to have a good idea is to have a lot of ideas.', author: 'Linus Pauling', role: 'two-time Nobel laureate' },
  { text: 'Scientists discover the world that exists; engineers create the world that never was.', author: 'Theodore von Kármán', role: 'aerospace engineer' },
  { text: 'It always seems impossible until it is done.', author: 'Nelson Mandela' },
  { text: 'Creativity is thinking up new things. Innovation is doing new things.', author: 'Theodore Levitt', role: 'Harvard Business School' },
  { text: 'Never say no to an idea — you never know how that idea will ignite another.', author: 'Stanley Kubrick', role: 'film director' },
  { text: 'The best way to predict the future is to invent it.', author: 'Alan Kay', role: 'computer scientist' },
  { text: 'There is a way to do it better. Find it.', author: 'Thomas Edison' },
  { text: 'Everything begins with an idea.', author: 'Earl Nightingale' },
  { text: 'Innovation distinguishes between a leader and a follower.', author: 'Steve Jobs' },
];

const INTERVAL_MS = 4000;

export default function QuoteRotator({ quotes = QUOTES }: { quotes?: Quote[] }) {
  const reduced = !!useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (reduced || paused || quotes.length < 2) return;
    timer.current = setInterval(() => setI(n => (n + 1) % quotes.length), INTERVAL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [reduced, paused, quotes.length]);

  const q = quotes[i];

  return (
    <div
      className="border-y border-hairline bg-navy-900/40"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        aria-live="off"
        className="max-w-4xl mx-auto px-6 lg:px-8 py-14 sm:py-16 text-center"
        // A fixed minimum keeps the band from jumping as quotes change length.
        style={{ minHeight: '13.5rem' }}
      >
        <AnimatePresence mode="wait">
          <motion.figure
            key={i}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduced ? 0.12 : DUR.enter, ease: EASE_OUT as unknown as number[] }}
          >
            <blockquote>
              <p className="text-xl sm:text-2xl text-white leading-[1.45] tracking-tight text-balance measure mx-auto">
                {/* The marks wrap the words, as a quotation is actually set —
                    a mark floating above the line reads as an ornament that
                    lost its sentence. Gold, so the attribution below and the
                    marks above frame the same block. */}
                <span aria-hidden="true" className="text-gold-400/70">&ldquo;</span>
                {q.text}
                <span aria-hidden="true" className="text-gold-400/70">&rdquo;</span>
              </p>
            </blockquote>
            <figcaption className="mt-5">
              <span className="block text-gold-400 text-sm font-semibold tracking-tight">{q.author}</span>
              {q.role && <span className="block text-slate-500 text-2xs mt-1">{q.role}</span>}
            </figcaption>
          </motion.figure>
        </AnimatePresence>
      </div>

      {/* Progress pips double as the pause affordance's feedback: they stop
          advancing while the pointer or focus is inside the band. */}
      <div className="pb-8 flex items-center justify-center gap-2">
        {quotes.map((qq, n) => (
          <button
            key={qq.author + n}
            type="button"
            aria-label={`Show quotation ${n + 1} of ${quotes.length}`}
            aria-current={n === i || undefined}
            onClick={() => setI(n)}
            className={`h-1.5 rounded-full transition-ui duration-micro ease-house ${n === i ? 'w-6 bg-gold-400' : 'w-1.5 bg-white/20 hover:bg-white/40'}`}
          />
        ))}
      </div>
    </div>
  );
}
