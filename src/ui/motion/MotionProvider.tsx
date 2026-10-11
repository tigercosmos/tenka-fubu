import { useEffect, useState, type ReactNode } from 'react';
import { MotionContext } from './MotionContext';

export function MotionProvider({ children }: { children: ReactNode }) {
  const [query] = useState(() =>
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null,
  );
  const [reduced, setReduced] = useState(query?.matches ?? false);
  useEffect(() => {
    if (query === null) return;
    const changed = (event: MediaQueryListEvent) => setReduced(event.matches);
    setReduced(query.matches);
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', changed);
      return () => query.removeEventListener('change', changed);
    }
    query.addListener(changed);
    return () => query.removeListener(changed);
  }, [query]);
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-reduced-motion');
    root.setAttribute('data-reduced-motion', String(reduced));
    return () => {
      if (previous === null) root.removeAttribute('data-reduced-motion');
      else root.setAttribute('data-reduced-motion', previous);
    };
  }, [reduced]);
  return <MotionContext.Provider value={reduced}>{children}</MotionContext.Provider>;
}
