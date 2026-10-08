import { useEffect, useState } from 'react';

const secondsUntil = (timestamp: number | null): number =>
  timestamp === null ? 0 : Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));

/**
 * `until` (ms, `Date.now()` o'lchovida) gacha qolgan soniyalar.
 * Hisob bloklanganda qolgan vaqtni ko'rsatish uchun.
 */
export function useCountdown(until: number | null): number {
  const [remaining, setRemaining] = useState(() => secondsUntil(until));

  useEffect(() => {
    setRemaining(secondsUntil(until));
    if (until === null) return;

    const timer = window.setInterval(() => {
      const left = secondsUntil(until);
      setRemaining(left);
      if (left === 0) window.clearInterval(timer);
    }, 500);
    return () => window.clearInterval(timer);
  }, [until]);

  return remaining;
}
