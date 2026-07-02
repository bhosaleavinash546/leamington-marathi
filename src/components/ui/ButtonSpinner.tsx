import { motion } from 'framer-motion';

export default function ButtonSpinner({ size = 16 }: { size?: number }) {
  return (
    <motion.span
      className="inline-block rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size, flexShrink: 0 }}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
    />
  );
}
