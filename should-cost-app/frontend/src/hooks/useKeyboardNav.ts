import { useCallback, useRef, useState } from 'react';

interface UseKeyboardNavOptions {
  itemCount: number;
  onSelect?: (index: number) => void;
  onDelete?: (index: number) => void;
}

/**
 * Keyboard navigation for data tables.
 * Returns props to spread onto the <tbody> element and the active index.
 *
 * Keys: ↑/↓ move, Enter/Space select, Delete/Backspace delete, Home/End jump.
 */
export function useKeyboardNav({ itemCount, onSelect, onDelete }: UseKeyboardNavOptions) {
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  const focusRow = useCallback((idx: number) => {
    if (!tbodyRef.current) return;
    const rows = tbodyRef.current.querySelectorAll('tr');
    const target = rows[idx] as HTMLElement | undefined;
    target?.focus();
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (itemCount === 0) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = Math.min(activeIndex + 1, itemCount - 1);
        setActiveIndex(next);
        focusRow(next);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev = Math.max(activeIndex - 1, 0);
        setActiveIndex(prev);
        focusRow(prev);
        break;
      }
      case 'Home': {
        e.preventDefault();
        setActiveIndex(0);
        focusRow(0);
        break;
      }
      case 'End': {
        e.preventDefault();
        const last = itemCount - 1;
        setActiveIndex(last);
        focusRow(last);
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (activeIndex >= 0 && onSelect) onSelect(activeIndex);
        break;
      }
      case 'Delete':
      case 'Backspace': {
        if (activeIndex >= 0 && onDelete) {
          e.preventDefault();
          onDelete(activeIndex);
        }
        break;
      }
    }
  }, [activeIndex, itemCount, focusRow, onSelect, onDelete]);

  const getRowProps = useCallback((index: number) => ({
    tabIndex: index === activeIndex ? 0 : -1,
    'aria-selected': index === activeIndex,
    onFocus: () => setActiveIndex(index),
    style: index === activeIndex
      ? { outline: '2px solid var(--accent)', outlineOffset: '-2px' }
      : undefined,
  }), [activeIndex]);

  const tbodyProps = {
    ref: tbodyRef,
    role: 'rowgroup' as const,
    onKeyDown: handleKeyDown,
  };

  return { activeIndex, tbodyProps, getRowProps };
}
