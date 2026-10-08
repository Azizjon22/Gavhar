import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export interface LightboxItem {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  url: string;
  thumbUrl: string | null;
  mimeType?: string;
  /** Rasm ostida ko'rsatiladigan izoh (masalan taom nomi). */
  caption?: string;
}

interface LightboxProps {
  items: LightboxItem[];
  /** Ochiq elementning indeksi; `null` — yopiq. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  title: string;
}

const navButton =
  'absolute top-1/2 z-10 flex size-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors outline-none hover:bg-white/20 focus-visible:ring-[3px] focus-visible:ring-gold/60';

/** To'liq ekranli ko'rish: rasm va video, klaviatura (← →, Esc) bilan boshqariladi. */
export function Lightbox({ items, index, onIndexChange, title }: LightboxProps) {
  const { t } = useTranslation();
  const item = index === null ? undefined : items[index];
  const hasMany = items.length > 1;

  useEffect(() => {
    if (index === null || !hasMany) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') onIndexChange((index + 1) % items.length);
      if (event.key === 'ArrowLeft') onIndexChange((index - 1 + items.length) % items.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasMany, items.length, onIndexChange]);

  return (
    <DialogPrimitive.Root
      open={item !== undefined}
      onOpenChange={(open) => !open && onIndexChange(null)}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/92 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 outline-none sm:p-12"
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {item &&
            (item.kind === 'VIDEO' ? (
              <video
                key={item.id}
                src={item.url}
                poster={item.thumbUrl ?? undefined}
                controls
                autoPlay
                playsInline
                className="max-h-full max-w-full rounded-lg bg-black"
              />
            ) : (
              <img
                key={item.id}
                src={item.url}
                alt={item.caption ?? title}
                className="max-h-full max-w-full rounded-lg object-contain animate-in fade-in-0 zoom-in-95"
              />
            ))}
          {item?.caption && (
            <p className="pointer-events-none absolute inset-x-0 top-5 mx-auto w-fit max-w-[70%] truncate rounded-full bg-black/55 px-5 py-2 font-display text-xl font-semibold text-white backdrop-blur">
              {item.caption}
            </p>
          )}

          {index !== null && hasMany && (
            <>
              <button
                type="button"
                aria-label={t('common.pagination.prev')}
                onClick={() => onIndexChange((index - 1 + items.length) % items.length)}
                className={`${navButton} left-3 sm:left-6`}
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                aria-label={t('common.pagination.next')}
                onClick={() => onIndexChange((index + 1) % items.length)}
                className={`${navButton} right-3 sm:right-6`}
              >
                <ChevronRight className="size-6" />
              </button>
              <p className="tabular absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                {index + 1} / {items.length}
              </p>
            </>
          )}
          <DialogPrimitive.Close
            aria-label={t('common.close')}
            className="absolute top-4 right-4 flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors outline-none hover:bg-white/20 focus-visible:ring-[3px] focus-visible:ring-gold/60"
          >
            <X className="size-5" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
