import { useState, useEffect } from 'react';

let isNative = false;
try {
  // Capacitor sets this flag when running inside a native WebView
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isNative = !!(window as any).Capacitor?.isNativePlatform?.();
} catch {}

export function useIsNative(): boolean {
  return isNative;
}

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => isNative || window.innerWidth < 768);
  useEffect(() => {
    if (isNative) return;
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}
