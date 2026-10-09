import { Video } from 'lucide-react';
import { InViewVideo } from '@/features/gallery/components/InViewVideo';
import type { GalleryAlbum, GalleryItem } from '@/features/gallery/types/gallery.types';
import { cn } from '@/lib/utils';

export interface BentoMedia {
  item: GalleryItem;
  album: GalleryAlbum;
}

interface GalleryBentoProps {
  media: BentoMedia[];
  /** Plitka bosilganda — `media` ichidagi tartib raqami. */
  onOpen: (index: number) => void;
  openLabel: (number: number) => string;
}

/**
 * Bento ritmi: har beshta plitkadan biri 2×2 katta, qolgan to'rttasi yonida
 * kichik. Oxirgi guruh to'liq bo'lmasa plitkalar kengayadi — 4 ustunli to'r
 * hech qachon teshik bilan tugamaydi.
 */
function tileSpans(count: number): string[] {
  const spans: string[] = [];
  for (let start = 0; start < count; start += 5) {
    const small = Math.min(4, count - start - 1);
    spans.push(small === 0 ? 'col-span-2 row-span-2 md:col-span-4' : 'col-span-2 row-span-2');
    if (small === 4) spans.push('', '', '', '');
    if (small === 3) spans.push('', '', 'col-span-2');
    if (small === 2) spans.push('col-span-2', 'col-span-2');
    if (small === 1) spans.push('col-span-2 row-span-2');
  }
  return spans;
}

/** Taqdimot galereyasi: rasm va videolar bir xil balandlikdagi mozaika plitkalarida. */
export function GalleryBento({ media, onOpen, openLabel }: GalleryBentoProps) {
  const spans = tileSpans(media.length);

  return (
    <div className="grid auto-rows-[clamp(130px,38vw,190px)] grid-flow-dense grid-cols-2 gap-2 min-[400px]:gap-3 md:auto-rows-[clamp(180px,16vw,340px)] md:grid-cols-4">
      {media.map(({ item, album }, index) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(index)}
          aria-label={openLabel(index + 1)}
          className={cn(
            'group relative cursor-pointer overflow-hidden rounded-2xl bg-white/5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-gold/70 focus-visible:ring-inset',
            spans[index],
          )}
        >
          {item.kind === 'VIDEO' ? (
            <InViewVideo
              src={item.url}
              poster={item.thumbUrl}
              className="pointer-events-none h-full w-full object-cover"
            />
          ) : item.thumbUrl ? (
            <img
              src={item.thumbUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <span className="bg-sidebar-gradient flex h-full w-full items-center justify-center">
              <Video className="size-10 text-gold-light/60" strokeWidth={1.3} />
            </span>
          )}
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-80 transition-opacity group-hover:opacity-100" />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4">
            <span className="block text-[10px] font-medium tracking-[0.25em] text-gold-light uppercase">
              {album.title}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
