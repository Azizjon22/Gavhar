import { Injectable } from '@nestjs/common';
import { Dish, Prisma } from '@prisma/client';
import { AppException } from '@/common/errors/app.exception';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { PhotoService } from '@/infrastructure/storage/photo.service';
import { AuditService } from '@/modules/audit/audit.service';

const key = (name: string) => name.trim().toLowerCase();

/**
 * Taomlar katalogi. Paket tarkibida taomlar nom bilan yoziladi; shu yerda o'sha
 * nomga rasm va tavsif beriladi. Ro'yxat ikki manbadan yig'iladi: paketlarda
 * ishlatilgan nomlar va katalogga kiritilgan yozuvlar.
 */
@Injectable()
export class DishesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photos: PhotoService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const [dishes, sections] = await Promise.all([
      this.prisma.dish.findMany(),
      this.prisma.menuPackageSection.findMany({
        where: { package: { deletedAt: null }, category: { deletedAt: null } },
        select: {
          items: true,
          packageId: true,
          category: { select: { nameUz: true } },
        },
      }),
    ]);

    const saved = new Map(dishes.map((dish) => [key(dish.name), dish]));
    const usage = new Map<string, { name: string; packages: Set<string> }>();
    for (const section of sections) {
      // Nom yozilmagan bo'lim o'zi taom: rasm shu nomga qo'yiladi.
      const names = section.items.length > 0 ? section.items : [section.category.nameUz];
      for (const item of names) {
        const entry = usage.get(key(item)) ?? { name: item, packages: new Set<string>() };
        entry.packages.add(section.packageId);
        usage.set(key(item), entry);
      }
    }

    const names = new Map<string, string>();
    // Paketda yozilgan ko'rinishi ustun turadi ("Sezar"), katalogdagi yozuv esa zaxira.
    for (const [id, dish] of saved) names.set(id, dish.name);
    for (const [id, entry] of usage) names.set(id, entry.name);

    const rows = await Promise.all(
      [...names.entries()].map(async ([id, name]) => {
        const dish = saved.get(id);
        return {
          name,
          description: dish?.description ?? null,
          photo: await this.photos.urls(dish?.photoKey ?? null, dish?.photoThumbKey ?? null),
          /** Nechta paketda bor (0 — hech bir paketda ishlatilmayapti). */
          packages: usage.get(id)?.packages.size ?? 0,
        };
      }),
    );
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'uz'));
  }

  async save(name: string, description: string | null) {
    const existing = await this.find(name);
    const dish = existing
      ? await this.prisma.dish.update({ where: { id: existing.id }, data: { description } })
      : await this.prisma.dish.create({ data: { name: name.trim(), description } });
    await this.audit.log({
      action: 'menu.dish_update',
      resource: 'dish',
      resourceId: dish.id,
      before: { description: existing?.description ?? null },
      after: { name: dish.name, description },
    });
    return this.view(dish);
  }

  async setPhoto(name: string, file: Express.Multer.File | undefined) {
    const existing = await this.find(name);
    const photo = await this.photos.store('dishes', file);
    const data = { photoKey: photo.objectKey, photoThumbKey: photo.thumbKey };
    const dish = existing
      ? await this.prisma.dish.update({ where: { id: existing.id }, data })
      : await this.prisma.dish.create({ data: { name: name.trim(), ...data } });
    await this.photos.remove(existing?.photoKey, existing?.photoThumbKey);
    return this.view(dish);
  }

  async removePhoto(name: string) {
    const existing = await this.find(name);
    if (!existing?.photoKey) {
      throw AppException.notFound('DISH_PHOTO_NOT_FOUND', 'Bu taomga rasm yuklanmagan');
    }
    const dish = await this.prisma.dish.update({
      where: { id: existing.id },
      data: { photoKey: null, photoThumbKey: null },
    });
    await this.photos.remove(existing.photoKey, existing.photoThumbKey);
    return this.view(dish);
  }

  private find(name: string): Promise<Dish | null> {
    const where: Prisma.DishWhereInput = { name: { equals: name.trim(), mode: 'insensitive' } };
    return this.prisma.dish.findFirst({ where });
  }

  private async view(dish: Dish) {
    return {
      name: dish.name,
      description: dish.description,
      photo: await this.photos.urls(dish.photoKey, dish.photoThumbKey),
    };
  }
}
