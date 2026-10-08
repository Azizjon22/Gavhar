import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@/config/app-config.service';

const VERSION = 'v1';
const IV_BYTES = 12;

/** AES-256-GCM: bazada saqlanadigan sirlarni (masalan TOTP) shifrlaydi. */
@Injectable()
export class EncryptionService {
  constructor(private readonly config: AppConfigService) {}

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.config.auth.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [VERSION, iv, tag, ciphertext]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, ciphertext] = payload.split('.');
    if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
      throw new Error("Shifrlangan qiymat formati noto'g'ri");
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.config.auth.encryptionKey,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
