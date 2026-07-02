import { motion } from 'framer-motion';

export default function TypingDots({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[3px] ${className}`}>
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="block w-1.5 h-1.5 rounded-full bg-current"
          animate={{ y: [0, -5, 0], opacity: [0.35, 1, 0.35] }}
          transition={{
            duration: 0.75,
            delay: i * 0.16,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </span>
  );
}
