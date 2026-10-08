import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TIMEOUT_MS = 60_000;
const MAX_POSTER_BYTES = 20 * 1024 * 1024;

export type VideoFormat = 'mp4' | 'webm';

/** Video turini fayl boshidagi baytlar bo'yicha aniqlaydi (MP4/MOV — `ftyp`, WebM — EBML). */
export function sniffVideoFormat(head: Buffer): VideoFormat | null {
  if (head.length >= 12 && head.toString('latin1', 4, 8) === 'ftyp') return 'mp4';
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  return null;
}

/**
 * Videodan muqova uchun bitta kadr oladi. ffmpeg faylni havola orqali o'qiydi va
 * faqat kerakli qismini yuklaydi — butun video serverga ko'chirilmaydi.
 */
export async function extractPoster(url: string): Promise<Buffer | null> {
  // Avval 1-soniyadan (ko'pincha birinchi kadr qora bo'ladi), bo'lmasa boshidan.
  for (const offset of ['1', '0']) {
    try {
      const { stdout } = await run(
        'ffmpeg',
        [
          '-v',
          'error',
          '-ss',
          offset,
          '-i',
          url,
          '-frames:v',
          '1',
          '-f',
          'image2pipe',
          '-vcodec',
          'mjpeg',
          'pipe:1',
        ],
        { encoding: 'buffer', timeout: TIMEOUT_MS, maxBuffer: MAX_POSTER_BYTES },
      );
      if (stdout.length > 0) return stdout;
    } catch {
      // Keyingi urinish yoki muqovasiz davom etiladi.
    }
  }
  return null;
}

/** Video davomiyligi (soniya); aniqlab bo'lmasa `null`. */
export async function probeDuration(url: string): Promise<number | null> {
  try {
    const { stdout } = await run(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', url],
      { timeout: TIMEOUT_MS },
    );
    const seconds = Number.parseFloat(stdout.trim());
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null;
  } catch {
    return null;
  }
}
