import { Loader2, Play, TriangleAlert, Video } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { type GalleryItem, formatDuration } from '../types/gallery.types';

interface MediaTileProps {
  item: GalleryItem;
  label: string;
  onOpen: () => void;
  /** Kartaning ustki o'ng burchagidagi amallar (masalan o'chirish). */
  actions?: ReactNode;
  /** Videoning qayta ishlanish holatini ko'rsatish (xodimlar uchun; mijoz taqdimotida emas). */
  showStatus?: boolean;
  className?: string;
}

/** Galereyadagi bitta rasm yoki video: bosilganda to'liq ekranda ochiladi. */
export function MediaTile({
  item,
  label,
  onOpen,
  actions,
  showStatus = false,
  className,
}: MediaTileProps) {
  const { t } = useTranslation();
  const duration = formatDuration(item.durationSec);

  return (
    <div className={cn('group relative overflow-hidden rounded-xl bg-muted', className)}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        className="block w-full cursor-zoom-in outline-none focus-visible:ring-[3px] focus-visible:ring-gold/70 focus-visible:ring-inset"
      >
        {item.thumbUrl ? (
          <img
            src={item.thumbUrl}
            alt=""
            loading="lazy"
            width={item.width ?? undefined}
            height={item.height ?? undefined}
            className="h-auto w-full transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <span className="bg-sidebar-gradient flex aspect-video w-full items-center justify-center">
            <Video className="size-10 text-gold-light/60" strokeWidth={1.3} />
          </span>
        )}
        {item.kind === 'VIDEO' && (
          <>
            <span className="absolute inset-0 flex items-center justify-center bg-black/20">
              <span className="flex size-14 items-center justify-center rounded-full bg-white/90 text-emerald-brand shadow-lifted transition-transform group-hover:scale-110">
                <Play className="ml-0.5 size-6 fill-current" />
              </span>
            </span>
            {duration && (
              <span className="tabular absolute bottom-2 left-2 rounded-md bg-black/65 px-1.5 py-0.5 text-xs font-semibold text-white">
                {duration}
              </span>
            )}
          </>
        )}
      </button>
      {showStatus && item.processingStatus === 'PROCESSING' && (
        <span
          role="status"
          title={t('gallery.video.processingHint')}
          className="pointer-events-none absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-black/65 px-2 py-1 text-xs font-semibold text-white backdrop-blur"
        >
          <Loader2 className="size-3.5 animate-spin" />
          <span className="max-sm:sr-only">{t('gallery.video.processing')}</span>
        </span>
      )}
      {showStatus && item.processingStatus === 'FAILED' && (
        <span
          title={t('gallery.video.failedHint')}
          className="absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-amber-500/95 px-2 py-1 text-xs font-semibold text-black"
        >
          <TriangleAlert className="size-3.5" />
          <span className="max-sm:sr-only">{t('gallery.video.failed')}</span>
        </span>
      )}
      {actions && (
        <div className="absolute top-2 right-2 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
}
