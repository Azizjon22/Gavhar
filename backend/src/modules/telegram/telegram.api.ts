import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@/config/app-config.service';

/**
 * Telegram Bot API'ga chaqiruv. Alohida qatlam — testlarda haqiqiy Telegram o'rniga
 * soxtasi qo'yiladi (yuborilgan xabarlar yoziladi).
 */
@Injectable()
export class TelegramApi {
  constructor(private readonly config: AppConfigService) {}

  get token(): string {
    return this.config.telegram.token;
  }

  async call<T = unknown>(
    method: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(15_000),
    });
    const data = (await response.json()) as { ok: boolean; result: T; description?: string };
    if (!data.ok) throw new Error(data.description ?? `Telegram ${method} bajarilmadi`);
    return data.result;
  }
}
