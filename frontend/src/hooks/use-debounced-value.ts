import { useEffect, useState } from 'react';

/** Qiymat `delayMs` davomida o'zgarmay turgandagina yangilanadi (qidiruv uchun). */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
