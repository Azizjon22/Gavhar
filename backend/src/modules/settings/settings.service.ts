import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { AppException } from '@/common/errors/app.exception';
import { PhotoService } from '@/infrastructure/storage/photo.service';
import { AuditService } from '@/modules/audit/audit.service';

const BRAND_KEY = 'brand';
export const DEFAULT_BRAND_NAME = 'Gavhar';

interface StoredBrand {
  name: string;
  logoKey: string | null;
  logoThumbKey: string | null;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly photos: PhotoService,
  ) {}

  async getBrand() {
    const brand = await this.storedBrand();
    return {
      name: brand.name,
      logo: await this.photos.urls(brand.logoKey, brand.logoThumbKey),
    };
  }

  async updateBrandName(name: string) {
    const before = await this.storedBrand();
    await this.saveBrand({ ...before, name }, { name: before.name }, { name });
    return this.getBrand();
  }

  async setBrandLogo(file: Express.Multer.File | undefined) {
    const before = await this.storedBrand();
    const logo = await this.photos.store('brand', file);
    await this.saveBrand(
      { ...before, logoKey: logo.objectKey, logoThumbKey: logo.thumbKey },
      { logo: before.logoKey !== null },
      { logo: true },
    );
    await this.photos.remove(before.logoKey, before.logoThumbKey);
    return this.getBrand();
  }

  async removeBrandLogo() {
    const before = await this.storedBrand();
    if (!before.logoKey) throw AppException.notFound('BRAND_LOGO_NOT_FOUND', 'Logotip yuklanmagan');
    await this.saveBrand(
      { ...before, logoKey: null, logoThumbKey: null },
      { logo: true },
      { logo: false },
    );
    await this.photos.remove(before.logoKey, before.logoThumbKey);
    return this.getBrand();
  }

  private async storedBrand(): Promise<StoredBrand> {
    const row = await this.prisma.setting.findUnique({ where: { key: BRAND_KEY } });
    const value = (row?.value ?? {}) as Partial<StoredBrand>;
    return {
      name: typeof value.name === 'string' && value.name.trim() ? value.name : DEFAULT_BRAND_NAME,
      logoKey: typeof value.logoKey === 'string' ? value.logoKey : null,
      logoThumbKey: typeof value.logoThumbKey === 'string' ? value.logoThumbKey : null,
    };
  }

  private async saveBrand(brand: StoredBrand, before: object, after: object): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const value = { ...brand } as Prisma.InputJsonObject;
      await tx.setting.upsert({
        where: { key: BRAND_KEY },
        update: { value },
        create: { key: BRAND_KEY, value },
      });
      await this.audit.log(
        { action: 'settings.update', resource: 'settings', resourceId: 'brand', before, after },
        tx,
      );
    });
  }
}
