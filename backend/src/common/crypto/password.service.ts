import { Injectable, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '@/config/app-config.service';
import { hashPassword, passwordNeedsRehash, verifyPassword } from './password.util';
import { randomToken } from './token.util';

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash: string;

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(randomToken());
  }

  hash(password: string): Promise<string> {
    return hashPassword(password, this.config.auth.passwordPepper);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return verifyPassword(hash, password, this.config.auth.passwordPepper);
  }

  /**
   * Foydalanuvchi topilmaganda ham bir xil vaqt sarflash uchun — javob
   * vaqtidan email mavjudligini aniqlab bo'lmasin.
   */
  async verifyDummy(password: string): Promise<false> {
    await this.verify(this.dummyHash, password);
    return false;
  }

  needsRehash(hash: string): boolean {
    return passwordNeedsRehash(hash);
  }
}
