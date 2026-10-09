// Prism's AI panels unmount when the engineer steps Back and remount on the way
// forward. Their reads are paid model calls, and a remount used to start them
// empty — wiping confirmed observations without a word (Prism review PR-34).
// The page owns one memory object per part; each panel seeds its state from it
// and writes every change back, so a remount restores exactly what was there.
import { useEffect, useState } from 'react';

export type PanelMemory = Record<string, unknown>;

export function usePanelState<T>(memory: PanelMemory | undefined, key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => (memory && key in memory ? (memory[key] as T) : initial));
  useEffect(() => { if (memory) memory[key] = v; }, [memory, key, v]);
  return [v, setV];
}
