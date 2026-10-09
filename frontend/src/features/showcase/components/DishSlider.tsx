import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { LightboxItem } from '@/components/shared/Lightbox';

interface DishSliderProps {
  items: LightboxItem[];
  /** Ochiq slayd; `null` — yopiq. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
}

/**
 * Taom rasmlarini to'liq ekranda varaqlash: barmoq bilan surish, strelkalar va klaviatura.
 */
export function DishSlider({ items, index, onIndexChange }: DishSliderProps) {
  const { t } = useTranslation();
  const item = index === null ? undefined : items[index];
  const many = items.length > 1;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const indexRef = useRef(index ?? 0);
  /** Barmoq bilan surilgan slayd — qayta aylantirish shart emas. */
  const fromSwipe = useRef(false);
  /**
   * Dastur boshlagan aylantirishning manzili (slayd raqami). Shu yerga yetguncha
   * oraliq holatlar hisobga olinmaydi — aks holda bir bosishda bir necha slayd o'tib ketadi.
   */
  const target = useRef<number | null>(null);
  const settle = useRef<number | undefined>(undefined);
  /** Ochilgan paytda slayd darhol o'rniga qo'yiladi; keyingi o'tishlar silliq. */
  const opened = useRef(false);

  const slideWidth = (scroller: HTMLDivElement) => {
    const slide = scroller.firstElementChild;
    return slide instanceof HTMLElement
      ? slide.offsetWidth || scroller.clientWidth
      : scroller.clientWidth;
  };

  const alignTo = (next: number, smooth: boolean) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const width = slideWidth(scroller);
    if (width === 0) return;
    const left = next * width;
    if (Math.abs(scroller.scrollLeft - left) < 2) {
      target.current = null;
      return;
    }
    target.current = next;
    scroller.scrollTo({ left, behavior: smooth ? 'smooth' : 'instant' });
  };

  /** Aylantirish to'xtagach: manzilga yetgan bo'lsa — tamom; barmoq surgan bo'lsa — raqamni yangilash. */
  const commitSettled = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const width = slideWidth(scroller);
    if (width === 0) return;
    const position = scroller.scrollLeft / width;
    const nearest = Math.min(items.length - 1, Math.max(0, Math.round(position)));
    const atSlide = Math.abs(position - nearest) * width < 8;

    if (target.current !== null) {
      if (atSlide && nearest === target.current) target.current = null;
      return;
    }
    if (!atSlide || nearest === indexRef.current) return;
    fromSwipe.current = true;
    onIndexChange(nearest);
  }, [items.length, onIndexChange]);

  const setScroller = useCallback(
    (node: HTMLDivElement | null) => {
      // React 18 `scrollend`ni bilmaydi — to'g'ridan-to'g'ri ulanadi.
      scrollerRef.current?.removeEventListener('scrollend', commitSettled);
      scrollerRef.current = node;
      if (!node) return;
      node.addEventListener('scrollend', commitSettled);
      const width =
        node.firstElementChild instanceof HTMLElement
          ? node.firstElementChild.offsetWidth
          : node.clientWidth;
      if (width === 0) return;
      node.scrollLeft = indexRef.current * width;
    },
    [commitSettled],
  );

  useLayoutEffect(() => {
    if (index === null) {
      opened.current = false;
      target.current = null;
      return;
    }
    const previous = indexRef.current;
    indexRef.current = index;
    // Uzoq sakrash (masalan, oxiridan boshiga) — darhol; qo'shni slaydga — silliq.
    const smooth = opened.current && Math.abs(index - previous) <= 1;
    opened.current = true;
    if (fromSwipe.current) {
      fromSwipe.current = false;
      return;
    }
    alignTo(index, smooth);
  }, [index]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onIndexChange(null);
      if (many && event.key === 'ArrowRight') onIndexChange((index + 1) % items.length);
      if (many && event.key === 'ArrowLeft')
        onIndexChange((index - 1 + items.length) % items.length);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(settle.current);
    };
  }, [index, items.length, many, onIndexChange]);

  if (!item || index === null) return null;

  const go = (delta: number) => onIndexChange((index + delta + items.length) % items.length);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.caption ?? t('showcase.package.photosTitle')}
      className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-black/95"
    >
      <button
        type="button"
        onClick={() => onIndexChange(null)}
        aria-label={t('common.close')}
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-4 z-10 flex size-11 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/10 text-white outline-none hover:bg-white/20 focus-visible:ring-[3px] focus-visible:ring-gold/60"
      >
        <X className="size-5" />
      </button>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 pt-16 pb-8">
        <h2 className="max-w-3xl text-center font-display text-[clamp(1.75rem,4vw,2.75rem)] leading-tight font-semibold text-white">
          {item.caption}
          {many && (
            <span className="tabular ml-3 font-sans text-base font-medium text-white/50">
              {index + 1} / {items.length}
            </span>
          )}
        </h2>

        <div
          ref={setScroller}
          onScroll={() => {
            // `scrollend` bo'lmagan brauzerlar uchun zaxira: so'nggi harakatdan 80 ms keyin.
            window.clearTimeout(settle.current);
            settle.current = window.setTimeout(commitSettled, 80);
          }}
          onPointerDown={() => {
            // Barmoq tekkach dastur aylantirishi bekor bo'ladi — endi foydalanuvchi boshqaradi.
            target.current = null;
          }}
          className="flex max-h-[68vh] min-w-0 w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((slide, slideIndex) => (
            <div
              key={`${slide.id}-${slideIndex}`}
              className="flex min-w-full shrink-0 grow-0 basis-full snap-start snap-always items-center justify-center px-3 sm:px-8"
            >
              <img
                src={slide.url}
                alt={slide.caption ?? ''}
                draggable={false}
                className="max-h-[62vh] max-w-full rounded-lg object-contain shadow-2xl"
              />
            </div>
          ))}
        </div>
      </div>

      {many && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label={t('common.pagination.prev')}
            className="absolute top-1/2 left-3 z-10 flex size-12 -translate-y-1/2 cursor-pointer items-center justify-center text-white/70 outline-none hover:text-white focus-visible:ring-[3px] focus-visible:ring-gold/60 sm:left-6"
          >
            <ChevronLeft className="size-7" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label={t('common.pagination.next')}
            className="absolute top-1/2 right-3 z-10 flex size-12 -translate-y-1/2 cursor-pointer items-center justify-center text-white/70 outline-none hover:text-white focus-visible:ring-[3px] focus-visible:ring-gold/60 sm:right-6"
          >
            <ChevronRight className="size-7" strokeWidth={1.75} />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
