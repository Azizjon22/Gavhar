export interface GalleryItem {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  /** Muddatli imzolangan havolalar — saqlab qo'yilmaydi. */
  url: string;
  thumbUrl: string | null;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  durationSec: number | null;
  /**
   * Video fonda qayta ishlanadi. `PROCESSING` paytida ham asl fayl o'ynaydi;
   * `FAILED` — yuklangan holicha qolgan (ba'zi qurilmalarda o'ynamasligi mumkin).
   */
  processingStatus: 'READY' | 'PROCESSING' | 'FAILED';
}

export interface GalleryAlbum {
  id: string;
  title: string;
  description: string | null;
  /** Albom faqat shu menyu paketining taqdimot sahifasida ko'rinadi; `null` — hamma paketda. */
  menuPackageId: string | null;
  sortOrder: number;
  items: GalleryItem[];
}

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
/** MOV — iPhone videolari; server ularni MP4 ga aylantiradi. */
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024 - 1;

/** 95 → "1:35". */
export const formatDuration = (seconds: number | null): string | null =>
  seconds === null ? null : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
