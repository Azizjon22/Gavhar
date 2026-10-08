import sharp from 'sharp';
import { AppException } from '@/common/errors/app.exception';

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Dekompressiya "bombasi"dan himoya: ~80 megapikseldan katta rasm ochilmaydi. */
const MAX_INPUT_PIXELS = 80_000_000;
const FULL_MAX_SIDE = 2400;
const THUMB_MAX_SIDE = 720;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const AVIF_BRANDS = new Set(['avif', 'avis']);

/**
 * Fayl turini kengaytma yoki mijoz yuborgan MIME bo'yicha emas, faylning
 * dastlabki baytlari ("magic bytes") bo'yicha aniqlaydi.
 */
export function sniffImageFormat(buffer: Buffer): ImageFormat | null {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') {
    return 'webp';
  }
  if (
    buffer.toString('latin1', 4, 8) === 'ftyp' &&
    AVIF_BRANDS.has(buffer.toString('latin1', 8, 12))
  ) {
    return 'avif';
  }
  return null;
}

export interface ImageVariant {
  buffer: Buffer;
  width: number;
  height: number;
}

export interface ProcessedImage {
  full: ImageVariant;
  thumb: ImageVariant;
}

const invalidImage = () =>
  AppException.badRequest(
    'INVALID_IMAGE',
    'Fayl rasm emas yoki buzilgan. JPEG, PNG, WebP yoki AVIF yuklang',
  );

/**
 * Interfeys rasmlari (zal, taom) uchun: web'ga mos ikki nusxa — to'liq va kichik.
 * EXIF bo'yicha to'g'ri aylantiriladi; metadata (jumladan GPS) olib tashlanadi.
 * Studio'ning HD asl fayllari bu yerdan o'tmaydi — ular o'zgarishsiz saqlanadi.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (!sniffImageFormat(input)) throw invalidImage();

  const render = async (maxSide: number, quality: number): Promise<ImageVariant> => {
    const { data, info } = await sharp(input, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  };

  try {
    const [full, thumb] = await Promise.all([
      render(FULL_MAX_SIDE, 86),
      render(THUMB_MAX_SIDE, 78),
    ]);
    return { full, thumb };
  } catch {
    // Sarlavhasi to'g'ri, lekin ichi buzilgan yoki rasm bo'lmagan fayl.
    throw invalidImage();
  }
}
