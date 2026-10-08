import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type VideoProbe,
  displaySize,
  planVideo,
  remuxArgs,
  startsWithIndex,
  transcodeArgs,
} from './video-optimizer';

const probe = (overrides: Partial<VideoProbe> = {}): VideoProbe => ({
  codec: 'h264',
  width: 1920,
  height: 1080,
  pixelFormat: 'yuv420p',
  bitrate: 6_000_000,
  peakBitrate: 9_000_000,
  rotated: false,
  ...overrides,
});
const MP4 = { isMp4: true, indexFirst: true };

describe('planVideo', () => {
  it('ideal videoga tegmaydi', () => {
    expect(planVideo(probe(), MP4)).toEqual({ action: 'keep' });
  });

  it('indeksi oxirida bo‘lgan yoki MP4 bo‘lmagan H.264 ni faqat qayta o‘raydi', () => {
    expect(planVideo(probe(), { isMp4: true, indexFirst: false })).toEqual({ action: 'remux' });
    expect(planVideo(probe(), { isMp4: false, indexFirst: true })).toEqual({ action: 'remux' });
  });

  it('hamma joyda o‘ynamaydigan kodek va 10-bit tasvirni qayta kodlaydi', () => {
    expect(planVideo(probe({ codec: 'hevc' }), MP4)).toEqual({ action: 'transcode', scale: null });
    expect(planVideo(probe({ codec: 'vp9' }), { isMp4: false, indexFirst: false })).toEqual({
      action: 'transcode',
      scale: null,
    });
    expect(planVideo(probe({ pixelFormat: 'yuv420p10le' }), MP4)).toEqual({
      action: 'transcode',
      scale: null,
    });
  });

  it('juda og‘ir oqimni (o‘rtacha yoki eng band soniyasi) qayta kodlaydi', () => {
    expect(planVideo(probe({ bitrate: 45_000_000 }), MP4)).toEqual({
      action: 'transcode',
      scale: null,
    });
    expect(planVideo(probe({ peakBitrate: 30_000_000 }), MP4)).toEqual({
      action: 'transcode',
      scale: null,
    });
  });

  it('4K ni qisqa tomoni 1080 bo‘ladigan qilib kichraytiradi; tik videoda eni', () => {
    expect(planVideo(probe({ width: 3840, height: 2160 }), MP4)).toEqual({
      action: 'transcode',
      scale: 'scale=-2:1080:flags=lanczos',
    });
    expect(planVideo(probe({ width: 2160, height: 3840 }), MP4)).toEqual({
      action: 'transcode',
      scale: 'scale=1080:-2:flags=lanczos',
    });
    // Telefonni tik ushlab olingan: fayl ichida yotiq, ko'rinishi tik.
    expect(planVideo(probe({ width: 3840, height: 2160, rotated: true }), MP4)).toEqual({
      action: 'transcode',
      scale: 'scale=1080:-2:flags=lanczos',
    });
  });

  it('1080p dan kichik videoni kattalashtirmaydi', () => {
    expect(planVideo(probe({ width: 640, height: 360, codec: 'mpeg4' }), MP4)).toEqual({
      action: 'transcode',
      scale: null,
    });
  });
});

describe('displaySize', () => {
  it('burilgan videoda tomonlarni almashtiradi', () => {
    expect(displaySize(probe({ rotated: true }))).toEqual({ width: 1080, height: 1920 });
    expect(displaySize(probe())).toEqual({ width: 1920, height: 1080 });
  });
});

describe('ffmpeg buyruqlari', () => {
  it('qayta o‘rash tasvirni qayta kodlamaydi va indeksni boshiga qo‘yadi', () => {
    const args = remuxArgs('in.mov', 'out.mp4');
    expect(args.join(' ')).toContain('-c copy -movflags +faststart out.mp4');
  });

  it('qayta kodlash H.264 8-bit, AAC va faststart bilan; o‘lcham faqat kerak bo‘lsa', () => {
    const plain = transcodeArgs('in.mp4', 'out.mp4', null).join(' ');
    expect(plain).toContain('-c:v libx264');
    expect(plain).toContain('-pix_fmt yuv420p');
    expect(plain).toContain('-c:a aac');
    expect(plain).toContain('-movflags +faststart out.mp4');
    expect(plain).not.toContain('-vf');
    expect(transcodeArgs('in.mp4', 'out.mp4', 'scale=-2:1080:flags=lanczos')).toContain('-vf');
  });
});

describe('startsWithIndex', () => {
  let dir: string;
  const box = (type: string, payload = 8): Buffer => {
    const buffer = Buffer.alloc(8 + payload);
    buffer.writeUInt32BE(8 + payload, 0);
    buffer.write(type, 4, 'latin1');
    return buffer;
  };
  /** 64-bitli hajm bilan yozilgan quti (`size = 1`). */
  const largeBox = (type: string, payload = 8): Buffer => {
    const buffer = Buffer.alloc(16 + payload);
    buffer.writeUInt32BE(1, 0);
    buffer.write(type, 4, 'latin1');
    buffer.writeBigUInt64BE(BigInt(16 + payload), 8);
    return buffer;
  };
  const file = async (name: string, ...boxes: Buffer[]) => {
    const path = join(dir, name);
    await writeFile(path, Buffer.concat(boxes));
    return path;
  };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gavhar-video-spec-'));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('indeks ma‘lumotdan oldin tursa — rost', async () => {
    expect(await startsWithIndex(await file('a.mp4', box('ftyp'), box('moov'), box('mdat')))).toBe(
      true,
    );
    expect(
      await startsWithIndex(
        await file('b.mp4', box('ftyp'), largeBox('free'), box('moov'), box('mdat')),
      ),
    ).toBe(true);
  });

  it('indeks oxirida bo‘lsa — yolg‘on', async () => {
    expect(await startsWithIndex(await file('c.mp4', box('ftyp'), box('mdat'), box('moov')))).toBe(
      false,
    );
  });

  it('buzilgan, MP4 bo‘lmagan yoki mavjud bo‘lmagan faylda xato bermaydi', async () => {
    expect(await startsWithIndex(await file('d.bin', Buffer.from('salom')))).toBe(false);
    expect(await startsWithIndex(await file('e.bin', Buffer.alloc(64)))).toBe(false);
    await expect(startsWithIndex(join(dir, 'yoq.mp4'))).rejects.toThrow();
  });
});
