import sharp from 'sharp';
import { processImage, sniffImageFormat } from './image-processor';

const makeImage = (format: 'jpeg' | 'png' | 'webp' | 'avif', width = 3200, height = 1800) =>
  sharp({ create: { width, height, channels: 3, background: { r: 15, g: 76, b: 58 } } })
    [format]()
    .toBuffer();

describe('sniffImageFormat', () => {
  it.each(['jpeg', 'png', 'webp', 'avif'] as const)('%s faylni taniydi', async (format) => {
    expect(sniffImageFormat(await makeImage(format, 64, 64))).toBe(format);
  });

  it.each([
    ['matn', Buffer.from('bu rasm emas, oddiy matn fayli')],
    ['PDF', Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj')],
    ['HTML', Buffer.from('<html><script>alert(1)</script></html>')],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')],
    ['juda qisqa', Buffer.from([0xff, 0xd8])],
  ])('%s — rasm emas', (_name, buffer) => {
    expect(sniffImageFormat(buffer)).toBeNull();
  });
});

describe('processImage', () => {
  it('katta rasmni WebP ga o‘girib, ikki o‘lchamda qaytaradi', async () => {
    const result = await processImage(await makeImage('jpeg'));

    expect(result.full).toMatchObject({ width: 2400, height: 1350 });
    expect(result.thumb).toMatchObject({ width: 720, height: 405 });
    expect(sniffImageFormat(result.full.buffer)).toBe('webp');
    expect(sniffImageFormat(result.thumb.buffer)).toBe('webp');
  });

  it('kichik rasmni kattalashtirmaydi', async () => {
    const result = await processImage(await makeImage('png', 400, 300));

    expect(result.full).toMatchObject({ width: 400, height: 300 });
    expect(result.thumb).toMatchObject({ width: 400, height: 300 });
  });

  it('metadata (EXIF) natijaga o‘tmaydi', async () => {
    const withExif = await sharp(await makeImage('jpeg', 800, 600))
      .withExif({ IFD0: { Copyright: 'maxfiy', Artist: 'Egasi' } })
      .jpeg()
      .toBuffer();

    const { full } = await processImage(withExif);

    expect((await sharp(full.buffer).metadata()).exif).toBeUndefined();
  });

  it('rasm bo‘lmagan faylni rad etadi', async () => {
    await expect(processImage(Buffer.from('<?php system($_GET["c"]); ?>'))).rejects.toMatchObject({
      code: 'INVALID_IMAGE',
    });
  });

  it('sarlavhasi rasmga o‘xshagan, lekin buzilgan faylni rad etadi', async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 0x41)]);

    await expect(processImage(fake)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  });
});
