export type HallStatus = 'ACTIVE' | 'MAINTENANCE';

export interface HallImage {
  id: string;
  /** Muddatli imzolangan havolalar — saqlab qo'yilmaydi, har safar API'dan olinadi. */
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
}

export interface Hall {
  id: string;
  name: string;
  capacity: number;
  description: string | null;
  status: HallStatus;
  images: HallImage[];
  createdAt: string;
  updatedAt: string;
}

export interface HallPayload {
  name: string;
  capacity: number;
  description: string | null;
  status: HallStatus;
}

export const MAX_HALL_IMAGES = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
