import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';

/**
 * Oddiy mobil internetda ham to'xtamasdan o'ynaydigan chegara: 1080p, 8 Mbit/s gacha.
 * Telefon olgan 4K video 40–50 Mbit/s bo'ladi — aynan shu "qotadi".
 */
const MAX_SHORT_EDGE = 1080;
const MAX_BITRATE = 8_000_000;
/** O'rtacha oqimi bundan og'ir video kodeki to'g'ri bo'lsa ham qayta kodlanadi. */
const SMOOTH_BITRATE = 12_000_000;
/** Eng og'ir bir soniyasi bundan oshsa ham: aynan o'sha joyda ijro to'xtab qoladi. */
const SMOOTH_PEAK_BITRATE = 20_000_000;

export interface VideoProbe {
  codec: string;
  width: number;
  height: number;
  /** 8-bit 4:2:0 — barcha brauzer va telefonlar o'ynaydigan yagona H.264 turi. */
  pixelFormat: string;
  /** Bit/soniya; konteynerda yozilmagan bo'lsa 0. */
  bitrate: number;
  /** Eng og'ir bir soniyadagi bitlar soni. */
  peakBitrate: number;
  /** Tik ushlab olingan telefon videosi o'lchamini burishdan oldingi holatda beradi. */
  rotated: boolean;
}

export type VideoPlan =
  /** Allaqachon ideal: yuklangan holicha qoladi. */
  | { action: 'keep' }
  /** Kodek to'g'ri, lekin indeks fayl oxirida yoki konteyner MP4 emas: qayta kodlamasdan qayta o'raladi. */
  | { action: 'remux' }
  /** Kodek mos emas, juda katta yoki juda og'ir: bir marta, yuqori sifatda qayta kodlanadi. */
  | { action: 'transcode'; scale: string | null };

/** Tomoshabin ko'radigan o'lcham (burish hisobga olingan). */
export const displaySize = (probe: VideoProbe): { width: number; height: number } =>
  probe.rotated
    ? { width: probe.height, height: probe.width }
    : { width: probe.width, height: probe.height };

/**
 * Avvalo sifat: video faqat hamma joyda o'ynamaydigan yoki silliq o'ynamaydigan
 * bo'lsagina qayta kodlanadi. Hech qachon kattalashtirilmaydi.
 */
export function planVideo(
  probe: VideoProbe,
  container: { isMp4: boolean; indexFirst: boolean },
): VideoPlan {
  const shortEdge = Math.min(probe.width, probe.height);
  const playsEverywhere =
    probe.codec === 'h264' && (probe.pixelFormat === 'yuv420p' || probe.pixelFormat === 'yuvj420p');
  const tooLarge = shortEdge > MAX_SHORT_EDGE;
  const tooHeavy = probe.bitrate > SMOOTH_BITRATE || probe.peakBitrate > SMOOTH_PEAK_BITRATE;

  if (!playsEverywhere || tooLarge || tooHeavy) {
    if (!tooLarge) return { action: 'transcode', scale: null };
    // ffmpeg burishni filtrdan oldin qo'llaydi — tomoshabin ko'radigan shakl solishtiriladi.
    const { width, height } = displaySize(probe);
    return {
      action: 'transcode',
      // Qisqa tomon 1080 ga tushadi, nisbat saqlanadi; libx264 juft o'lcham talab qiladi.
      scale:
        width >= height
          ? `scale=-2:${MAX_SHORT_EDGE}:flags=lanczos`
          : `scale=${MAX_SHORT_EDGE}:-2:flags=lanczos`,
    };
  }
  return container.isMp4 && container.indexFirst ? { action: 'keep' } : { action: 'remux' };
}

/** Indeksni boshiga ko'chirib qayta o'raydi. Qayta kodlanmaydi — tasvir o'zgarmaydi. */
export const remuxArgs = (input: string, output: string): string[] => [
  '-y',
  '-i',
  input,
  '-map',
  '0:v:0',
  '-map',
  '0:a:0?',
  '-c',
  'copy',
  '-movflags',
  '+faststart',
  output,
];

export const transcodeArgs = (input: string, output: string, scale: string | null): string[] => [
  '-y',
  '-i',
  input,
  '-map',
  '0:v:0',
  '-map',
  '0:a:0?',
  ...(scale ? ['-vf', scale] : []),
  '-c:v',
  'libx264',
  '-profile:v',
  'high',
  // CRF 19 ko'zga asl nusxadan farq qilmaydi; chegara faqat juda "band" kadrlarda ishlaydi.
  '-preset',
  'medium',
  '-crf',
  '19',
  '-maxrate',
  String(MAX_BITRATE),
  '-bufsize',
  String(MAX_BITRATE * 2),
  // Busiz iPhone'ning 10-bit HDR videosi 10-bit qoladi va ko'p brauzerlar uni o'ynamaydi.
  '-pix_fmt',
  'yuv420p',
  // Har ikki soniyada kalit kadr: video ustida surish tez ishlaydi.
  '-force_key_frames',
  'expr:gte(t,n_forced*2)',
  '-c:a',
  'aac',
  '-b:a',
  '160k',
  '-ac',
  '2',
  '-movflags',
  '+faststart',
  output,
];

/**
 * MP4 indeksi ("moov") ma'lumotdan ("mdat") oldin turadimi: shunda brauzer butun
 * faylni kutmasdan, dastlabki kilobaytlardan keyinoq o'ynay boshlaydi.
 */
export async function startsWithIndex(path: string): Promise<boolean> {
  const file = await open(path, 'r');
  try {
    const header = Buffer.alloc(16);
    let offset = 0;
    for (let box = 0; box < 16; box++) {
      const { bytesRead } = await file.read(header, 0, 16, offset);
      if (bytesRead < 8) return false;
      let size = header.readUInt32BE(0);
      const type = header.toString('latin1', 4, 8);
      if (type === 'moov') return true;
      if (type === 'mdat') return false;
      if (size === 1 && bytesRead === 16) size = Number(header.readBigUInt64BE(8));
      if (size < 8) return false;
      offset += size;
    }
    return false;
  } catch {
    return false;
  } finally {
    await file.close();
  }
}

/** ffmpeg/ffprobe'ni ishga tushiradi; `signal` uzilsa jarayon to'xtatiladi. */
export function runTool(
  command: 'ffmpeg' | 'ffprobe',
  args: string[],
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    // ffmpeg hamma narsani stderr'ga yozadi; xato bo'lganda faqat oxiri kerak.
    child.stderr.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-2000)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} ${code ?? 'signal'} bilan tugadi: ${stderr.slice(-500)}`));
    });
  });
}

interface ProbeOutput {
  streams?: {
    codec_name?: string;
    width?: number;
    height?: number;
    pix_fmt?: string;
    bit_rate?: string;
    side_data_list?: { rotation?: number }[];
  }[];
  format?: { bit_rate?: string };
}

/** Video oqimi haqida ma'lumot; fayl video bo'lmasa yoki o'qib bo'lmasa `null`. */
export async function probeVideo(path: string, signal?: AbortSignal): Promise<VideoProbe | null> {
  let data: ProbeOutput;
  try {
    data = JSON.parse(
      await runTool(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=codec_name,width,height,pix_fmt,bit_rate:stream_side_data=rotation:format=bit_rate',
          '-of',
          'json',
          path,
        ],
        signal,
      ),
    ) as ProbeOutput;
  } catch {
    return null;
  }
  const stream = data.streams?.[0];
  if (!stream?.codec_name || !stream.width || !stream.height) return null;
  const rotation = Math.abs(
    stream.side_data_list?.find((side) => side.rotation !== undefined)?.rotation ?? 0,
  );
  return {
    codec: stream.codec_name.toLowerCase(),
    width: stream.width,
    height: stream.height,
    pixelFormat: stream.pix_fmt ?? '',
    bitrate: Number(stream.bit_rate ?? data.format?.bit_rate ?? 0) || 0,
    peakBitrate: await peakBitrate(path, signal),
    rotated: rotation === 90 || rotation === 270,
  };
}

/** Eng "band" soniya (bitlarda). Faqat paketlar indeksi o'qiladi — uzun videoda ham tez. */
async function peakBitrate(path: string, signal?: AbortSignal): Promise<number> {
  try {
    const out = await runTool(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'packet=pts_time,size',
        '-of',
        'csv=p=0',
        path,
      ],
      signal,
    );
    const perSecond = new Map<number, number>();
    for (const line of out.split('\n')) {
      const [time, size] = line.split(',');
      const second = Math.floor(Number(time));
      const bytes = Number(size);
      if (!line || !Number.isFinite(second) || !Number.isFinite(bytes)) continue;
      perSecond.set(second, (perSecond.get(second) ?? 0) + bytes);
    }
    let peak = 0;
    for (const bytes of perSecond.values()) peak = Math.max(peak, bytes);
    return peak * 8;
  } catch {
    return 0;
  }
}
