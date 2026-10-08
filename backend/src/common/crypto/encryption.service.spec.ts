import { randomBytes } from 'node:crypto';
import { AppConfigService } from '@/config/app-config.service';
import { EncryptionService } from './encryption.service';

const serviceWithKey = (key: Buffer) =>
  new EncryptionService({ auth: { encryptionKey: key } } as AppConfigService);

describe('EncryptionService', () => {
  const service = serviceWithKey(randomBytes(32));

  it('shifrlab, qayta ochadi', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = service.encrypt(secret);

    expect(encrypted).not.toContain(secret);
    expect(service.decrypt(encrypted)).toBe(secret);
  });

  it('har safar boshqa shifrmatn beradi (tasodifiy IV)', () => {
    expect(service.encrypt('bir xil')).not.toBe(service.encrypt('bir xil'));
  });

  it("o'zgartirilgan shifrmatnni rad etadi (GCM yaxlitlik tekshiruvi)", () => {
    const parts = service.encrypt('sir').split('.');
    parts[3] = Buffer.from('boshqa').toString('base64url');

    expect(() => service.decrypt(parts.join('.'))).toThrow();
  });

  it('boshqa kalit bilan ochilmaydi', () => {
    const encrypted = service.encrypt('sir');

    expect(() => serviceWithKey(randomBytes(32)).decrypt(encrypted)).toThrow();
  });

  it("noto'g'ri formatni rad etadi", () => {
    expect(() => service.decrypt('oddiy-matn')).toThrow(/format/);
  });
});
