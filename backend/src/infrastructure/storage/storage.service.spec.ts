import { AppConfigService } from '@/config/app-config.service';
import { StorageService } from './storage.service';

const config = {
  storage: {
    endpoint: 'http://minio:9000',
    publicEndpoint: 'https://files.gavhar.uz',
    region: 'us-east-1',
    accessKey: 'gavhar',
    secretKey: 'super-secret-key',
    forcePathStyle: true,
    buckets: { originals: 'gavhar-originals', derivatives: 'gavhar-derivatives' },
  },
} as AppConfigService;

describe('StorageService.signedUrl', () => {
  const service = new StorageService(config);

  afterEach(() => jest.useRealTimers());
  afterAll(() => service.onModuleDestroy());

  it('havola tashqi manzil uchun imzolanadi va muddatli', async () => {
    const url = new URL(await service.signedUrl('derivatives', 'halls/h1/i1.webp'));

    expect(url.origin).toBe('https://files.gavhar.uz');
    expect(url.pathname).toBe('/gavhar-derivatives/halls/h1/i1.webp');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('43200');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.href).not.toContain('super-secret-key');
  });

  it('bir oyna ichida havola o‘zgarmaydi — brauzer keshi ishlaydi', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-06T06:00:05Z') });
    const first = await service.signedUrl('derivatives', 'halls/h1/i1.webp');

    jest.setSystemTime(new Date('2026-10-06T11:59:50Z'));
    const sameWindow = await service.signedUrl('derivatives', 'halls/h1/i1.webp');

    jest.setSystemTime(new Date('2026-10-06T12:00:01Z'));
    const nextWindow = await service.signedUrl('derivatives', 'halls/h1/i1.webp');

    expect(sameWindow).toBe(first);
    expect(nextWindow).not.toBe(first);
  });

  it('turli fayllar uchun imzo turlicha', async () => {
    const a = await service.signedUrl('derivatives', 'halls/h1/a.webp');
    const b = await service.signedUrl('derivatives', 'halls/h1/b.webp');

    expect(new URL(a).searchParams.get('X-Amz-Signature')).not.toBe(
      new URL(b).searchParams.get('X-Amz-Signature'),
    );
  });
});
