import { useEffect, useRef } from 'react';

interface InViewVideoProps {
  src: string;
  poster?: string | null;
  className?: string;
}

/**
 * Ovozsiz, aylanib turadigan video — faqat ekranda ko'ringanda o'ynaydi.
 * Hamma klip birdan o'ynasa, har biri tarmoq va dekoder uchun talashib,
 * uzilib qoladi; ekrandan tashqaridagilar to'xtab turadi.
 */
export function InViewVideo({ src, poster, className }: InViewVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          // Avtoijro rad etilishi mumkin (batareya/trafik tejash) — birinchi kadr qoladi.
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [src]);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster ?? undefined}
      muted
      loop
      playsInline
      preload="metadata"
      className={className}
    />
  );
}
