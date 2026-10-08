import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '@/common/errors/app.exception';
import { processImage } from './image-processor';
import { StorageService } from './storage.service';

const BUCKET = 'derivatives';

export interface StoredPhoto {
  objectKey: string;
  thumbKey: string;
}

export interface PhotoUrls {
  /** Muddatli imzolangan havolalar — saqlab qo'yilmaydi, har safar API'dan olinadi. */
  url: string;
  thumbUrl: string;
}

/**
 * Bitta rasmli obyektlar (ombor mahsuloti, ishchi, taom, logotip) uchun umumiy yo'l:
 * fayl mazmuni tekshiriladi, WebP'ga o'giriladi (EXIF olib tashlanadi), to'liq va
 * kichik nusxa yopiq saqlash joyiga yoziladi.
 */
@Injectable()
export class PhotoService {
  private readonly logger = new Logger(PhotoService.name);

  constructor(private readonly storage: StorageService) {}

  async store(prefix: string, file: Express.Multer.File | undefined): Promise<StoredPhoto> {
    if (!file) throw AppException.badRequest('FILE_REQUIRED', 'Rasm fayli yuborilmagan');
    const { full, thumb } = await processImage(file.buffer);
    const id = randomUUID();
    const photo = { objectKey: `${prefix}/${id}.webp`, thumbKey: `${prefix}/${id}-thumb.webp` };
    await Promise.all([
      this.storage.put(BUCKET, photo.objectKey, full.buffer, 'image/webp'),
      this.storage.put(BUCKET, photo.thumbKey, thumb.buffer, 'image/webp'),
    ]);
    return photo;
  }

  /** Fayllarni o'chiradi; xato asosiy amalni buzmaydi — faqat logga yoziladi. */
  async remove(...keys: (string | null | undefined)[]): Promise<void> {
    const present = keys.filter((key): key is string => Boolean(key));
    if (present.length === 0) return;
    try {
      await this.storage.remove(BUCKET, present);
    } catch (error) {
      this.logger.error({ err: error, keys: present }, "Rasm fayllarini o'chirib bo'lmadi");
    }
  }

  async urls(objectKey: string | null, thumbKey: string | null): Promise<PhotoUrls | null> {
    if (!objectKey || !thumbKey) return null;
    const [url, thumbUrl] = await Promise.all([
      this.storage.signedUrl(BUCKET, objectKey),
      this.storage.signedUrl(BUCKET, thumbKey),
    ]);
    return { url, thumbUrl };
  }
}
