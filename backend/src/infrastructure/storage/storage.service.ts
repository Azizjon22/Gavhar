import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { AppConfigService } from '@/config/app-config.service';

/** `originals` — o'zgarmas asl fayllar; `derivatives` — qayta ishlangan nusxalar. */
export type StorageBucket = 'originals' | 'derivatives';

/**
 * Imzolangan havola shu oyna davomida bir xil bo'lib turadi — brauzer rasmni
 * keshlay oladi (har so'rovda yangi imzo bo'lsa, rasm qayta-qayta yuklanardi).
 */
const URL_WINDOW_SECONDS = 6 * 60 * 60;
/** Oyna oxirida berilgan havola ham kamida yana bir oyna yaroqli bo'ladi. */
const URL_TTL_SECONDS = 2 * URL_WINDOW_SECONDS;
const UPLOAD_URL_TTL_SECONDS = 60 * 60;

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  /** Havolalar brauzer murojaat qiladigan manzil uchun imzolanadi (imzo host'ni o'z ichiga oladi). */
  private readonly signer: S3Client;

  constructor(private readonly config: AppConfigService) {
    const { endpoint, publicEndpoint, region, accessKey, secretKey, forcePathStyle } =
      config.storage;
    const base = {
      region,
      forcePathStyle,
      // Imzolangan yuklash havolasiga bo'sh tana nazorat yig'indisi qo'shilib qolmasin:
      // aks holda ba'zi S3 xizmatlari brauzer yuklagan faylni rad etadi.
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    };
    this.client = new S3Client({ ...base, endpoint });
    this.signer = new S3Client({ ...base, endpoint: publicEndpoint });
  }

  async put(bucket: StorageBucket, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: key,
        Body: body,
        ContentType: contentType,
        // Kalitlar takrorlanmas (UUID) — obyekt hech qachon o'zgarmaydi.
        CacheControl: 'private, max-age=31536000, immutable',
      }),
    );
  }

  /** Diskdagi faylni yuklaydi (katta video xotiraga olinmaydi); hajmini qaytaradi. */
  async putFile(
    bucket: StorageBucket,
    key: string,
    sourcePath: string,
    contentType: string,
  ): Promise<number> {
    const { size } = await stat(sourcePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: key,
        Body: createReadStream(sourcePath),
        ContentLength: size,
        ContentType: contentType,
        CacheControl: 'private, max-age=31536000, immutable',
      }),
    );
    return size;
  }

  /** Obyektni diskdagi faylga ko'chiradi. */
  async download(bucket: StorageBucket, key: string, targetPath: string): Promise<void> {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: key }),
    );
    if (!object.Body) throw new Error(`Obyekt bo'sh: ${key}`);
    await pipeline(object.Body as Readable, createWriteStream(targetPath));
  }

  async remove(bucket: StorageBucket, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucketName(bucket),
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }

  /** Bucket'lar yopiq — fayl faqat muddatli imzolangan havola orqali ochiladi. */
  signedUrl(bucket: StorageBucket, key: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % URL_WINDOW_SECONDS);

    return getSignedUrl(
      this.signer,
      new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: key }),
      { expiresIn: URL_TTL_SECONDS, signingDate: new Date(windowStart * 1000) },
    );
  }

  /**
   * Brauzer faylni to'g'ridan-to'g'ri saqlash joyiga yuklashi uchun bir martalik
   * havola — katta videolar API serveri orqali o'tmaydi.
   */
  presignedUploadUrl(bucket: StorageBucket, key: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.signer,
      new PutObjectCommand({ Bucket: this.bucketName(bucket), Key: key, ContentType: contentType }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
  }

  /** Server ichidan o'qish uchun (masalan ffmpeg) — ichki manzil bilan imzolangan havola. */
  internalUrl(bucket: StorageBucket, key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: key }),
      { expiresIn: 600 },
    );
  }

  /** Obyekt hajmi; mavjud bo'lmasa `null`. */
  async size(bucket: StorageBucket, key: string): Promise<number | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketName(bucket), Key: key }),
      );
      return head.ContentLength ?? 0;
    } catch {
      return null;
    }
  }

  /** Faylning dastlabki baytlari — turini "magic bytes" bo'yicha tekshirish uchun. */
  async readHead(bucket: StorageBucket, key: string, bytes = 32): Promise<Buffer> {
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: key,
        Range: `bytes=0-${bytes - 1}`,
      }),
    );
    return Buffer.from((await object.Body?.transformToByteArray()) ?? []);
  }

  /** Readiness tekshiruvi uchun. */
  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucketName('derivatives') }));
  }

  onModuleDestroy(): void {
    this.client.destroy();
    this.signer.destroy();
  }

  private bucketName(bucket: StorageBucket): string {
    return this.config.storage.buckets[bucket];
  }
}
