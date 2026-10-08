import { sniffVideoFormat } from './video-probe';

describe('sniffVideoFormat', () => {
  const mp4 = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x20]),
    Buffer.from('ftypisom', 'latin1'),
    Buffer.alloc(20),
  ]);
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(28)]);

  it('MP4 ni `ftyp` belgisi bo‘yicha taniydi', () => {
    expect(sniffVideoFormat(mp4)).toBe('mp4');
  });

  it('WebM ni EBML sarlavhasi bo‘yicha taniydi', () => {
    expect(sniffVideoFormat(webm)).toBe('webm');
  });

  it('kengaytmasi video, lekin mazmuni boshqa faylni rad etadi', () => {
    expect(sniffVideoFormat(Buffer.from('<?php echo shell_exec($_GET["c"]); ?>'))).toBeNull();
    expect(
      sniffVideoFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])),
    ).toBeNull();
  });

  it('juda qisqa faylda xato bermaydi', () => {
    expect(sniffVideoFormat(Buffer.alloc(0))).toBeNull();
    expect(sniffVideoFormat(Buffer.from([0x1a, 0x45]))).toBeNull();
  });
});
