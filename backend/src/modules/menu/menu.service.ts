import { Injectable } from '@nestjs/common';
import { MenuCategory, Prisma } from '@prisma/client';
import { AppException } from '@/common/errors/app.exception';
import { money, moneyString } from '@/common/utils/money.util';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { PhotoService } from '@/infrastructure/storage/photo.service';
import { auditDiff } from '@/modules/audit/audit-sanitizer';
import { AuditService } from '@/modules/audit/audit.service';
import {
  CreateMenuCategoryDto,
  CreateMenuPackageDto,
  MenuSectionDto,
  UpdateMenuCategoryDto,
  UpdateMenuPackageDto,
} from './dto/menu.dto';

const PACKAGE_INCLUDE = {
  sections: { include: { category: true } },
} satisfies Prisma.MenuPackageInclude;

type PackageRecord = Prisma.MenuPackageGetPayload<{ include: typeof PACKAGE_INCLUDE }>;

const categoryView = (category: MenuCategory) => ({
  id: category.id,
  nameUz: category.nameUz,
  nameRu: category.nameRu,
  sortOrder: category.sortOrder,
});

/** Bo'limlar kategoriya tartibida; o'chirilgan kategoriyaga tegishlilari ko'rsatilmaydi. */
const packageView = (pkg: PackageRecord) => ({
  id: pkg.id,
  name: pkg.name,
  description: pkg.description,
  pricePerGuest: moneyString(pkg.pricePerGuest),
  badge: pkg.badge,
  isActive: pkg.isActive,
  sortOrder: pkg.sortOrder,
  sections: pkg.sections
    .filter((section) => section.category.deletedAt === null)
    .sort((a, b) => a.category.sortOrder - b.category.sortOrder)
    .map((section) => ({
      categoryId: section.categoryId,
      nameUz: section.category.nameUz,
      nameRu: section.category.nameRu,
      kindsCount: section.kindsCount,
      items: section.items,
    })),
  updatedAt: pkg.updatedAt,
});

const packageAudit = (pkg: ReturnType<typeof packageView>) => ({
  name: pkg.name,
  description: pkg.description,
  pricePerGuest: pkg.pricePerGuest,
  badge: pkg.badge,
  isActive: pkg.isActive,
  sections: pkg.sections.map(
    (section) =>
      `${section.nameUz} — ${section.kindsCount} xil${section.items.length ? `: ${section.items.join(', ')}` : ''}`,
  ),
});

const categoryNotFound = () =>
  AppException.notFound('MENU_CATEGORY_NOT_FOUND', "Menyu bo'limi topilmadi");
const packageNotFound = () =>
  AppException.notFound('MENU_PACKAGE_NOT_FOUND', 'Menyu paketi topilmadi');

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly photos: PhotoService,
  ) {}

  // ── Bo'limlar (kategoriyalar) ────────────────────────────────────────────

  async listCategories() {
    const categories = await this.prisma.menuCategory.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return categories.map(categoryView);
  }

  async createCategory(dto: CreateMenuCategoryDto) {
    await this.assertCategoryNameFree(dto.nameUz);
    const last = await this.prisma.menuCategory.aggregate({
      where: { deletedAt: null },
      _max: { sortOrder: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const category = await tx.menuCategory.create({
        data: { ...dto, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      });
      await this.audit.log(
        {
          action: 'menu.category_create',
          resource: 'menu_category',
          resourceId: category.id,
          after: dto,
        },
        tx,
      );
      return categoryView(category);
    });
  }

  async updateCategory(id: string, dto: UpdateMenuCategoryDto) {
    const before = await this.findCategory(id);
    if (dto.nameUz !== undefined && dto.nameUz.toLowerCase() !== before.nameUz.toLowerCase()) {
      await this.assertCategoryNameFree(dto.nameUz, id);
    }

    return this.prisma.$transaction(async (tx) => {
      const category = await tx.menuCategory.update({ where: { id }, data: dto });
      const diff = auditDiff(
        { nameUz: before.nameUz, nameRu: before.nameRu },
        { nameUz: category.nameUz, nameRu: category.nameRu },
      );
      if (diff) {
        await this.audit.log(
          { action: 'menu.category_update', resource: 'menu_category', resourceId: id, ...diff },
          tx,
        );
      }
      return categoryView(category);
    });
  }

  /** Bo'lim o'chirilsa, paketlar tarkibidan ham chiqadi. */
  async removeCategory(id: string): Promise<void> {
    const category = await this.findCategory(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.menuPackageSection.deleteMany({ where: { categoryId: id } });
      await tx.menuCategory.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(
        {
          action: 'menu.category_delete',
          resource: 'menu_category',
          resourceId: id,
          before: { nameUz: category.nameUz, nameRu: category.nameRu },
        },
        tx,
      );
    });
  }

  async reorderCategories(ids: string[]) {
    const existing = await this.prisma.menuCategory.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    this.assertSamePermutation(
      ids,
      existing.map((category) => category.id),
    );

    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.menuCategory.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    return this.listCategories();
  }

  // ── Paketlar ─────────────────────────────────────────────────────────────

  async listPackages(options: { activeOnly?: boolean } = {}) {
    const packages = await this.prisma.menuPackage.findMany({
      where: { deletedAt: null, ...(options.activeOnly && { isActive: true }) },
      include: PACKAGE_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { pricePerGuest: 'asc' }],
    });
    return Promise.all(packages.map((pkg) => this.withCover(pkg)));
  }

  async createPackage(dto: CreateMenuPackageDto) {
    await this.assertPackageNameFree(dto.name);
    const sections = await this.validSections(dto.sections);
    const last = await this.prisma.menuPackage.aggregate({
      where: { deletedAt: null },
      _max: { sortOrder: true },
    });
    const price = money(dto.pricePerGuest);

    const created = await this.prisma.$transaction(async (tx) => {
      const pkg = await tx.menuPackage.create({
        data: {
          name: dto.name,
          description: dto.description || null,
          pricePerGuest: price,
          badge: dto.badge || null,
          isActive: dto.isActive,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
          sections: { create: sections },
          prices: { create: { price } },
        },
        include: PACKAGE_INCLUDE,
      });
      const view = packageView(pkg);
      await this.audit.log(
        {
          action: 'menu.package_create',
          resource: 'menu_package',
          resourceId: pkg.id,
          after: packageAudit(view),
        },
        tx,
      );
      return pkg;
    });
    return this.withCover(created);
  }

  async updatePackage(id: string, dto: UpdateMenuPackageDto) {
    const before = await this.findPackage(id);
    if (dto.name !== undefined && dto.name.toLowerCase() !== before.name.toLowerCase()) {
      await this.assertPackageNameFree(dto.name, id);
    }
    const sections = dto.sections ? await this.validSections(dto.sections) : undefined;
    const price = dto.pricePerGuest !== undefined ? money(dto.pricePerGuest) : undefined;
    const priceChanged = price !== undefined && !price.eq(before.pricePerGuest);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (sections) await tx.menuPackageSection.deleteMany({ where: { packageId: id } });
      const pkg = await tx.menuPackage.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description || null }),
          ...(dto.badge !== undefined && { badge: dto.badge || null }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(price && { pricePerGuest: price }),
          ...(sections && { sections: { create: sections } }),
          // Narx tarixi: eski bronlar o'z narxida qoladi, o'zgarish esa shu yerda ko'rinadi.
          ...(priceChanged && { prices: { create: { price } } }),
        },
        include: PACKAGE_INCLUDE,
      });
      const view = packageView(pkg);
      const diff = auditDiff(packageAudit(packageView(before)), packageAudit(view));
      if (diff) {
        await this.audit.log(
          { action: 'menu.package_update', resource: 'menu_package', resourceId: id, ...diff },
          tx,
        );
      }
      return pkg;
    });
    return this.withCover(updated);
  }

  /** Muqova rasmi: mijozga taqdimotda paket kartasi va sahifasining foni. */
  async setPackageCover(id: string, file: Express.Multer.File | undefined) {
    const before = await this.findPackage(id);
    const photo = await this.photos.store(`menu/packages/${id}`, file);
    const pkg = await this.prisma.menuPackage.update({
      where: { id },
      data: { coverKey: photo.objectKey, coverThumbKey: photo.thumbKey },
      include: PACKAGE_INCLUDE,
    });
    await this.photos.remove(before.coverKey, before.coverThumbKey);
    await this.audit.log({
      action: 'menu.package_cover',
      resource: 'menu_package',
      resourceId: id,
      after: { name: pkg.name, cover: true },
    });
    return this.withCover(pkg);
  }

  async removePackageCover(id: string) {
    const before = await this.findPackage(id);
    const pkg = await this.prisma.menuPackage.update({
      where: { id },
      data: { coverKey: null, coverThumbKey: null },
      include: PACKAGE_INCLUDE,
    });
    await this.photos.remove(before.coverKey, before.coverThumbKey);
    if (before.coverKey) {
      await this.audit.log({
        action: 'menu.package_cover',
        resource: 'menu_package',
        resourceId: id,
        after: { name: pkg.name, cover: false },
      });
    }
    return this.withCover(pkg);
  }

  async removePackage(id: string): Promise<void> {
    const pkg = await this.findPackage(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.menuPackage.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
      // Shu paketga biriktirilgan albomlar yo'qolib qolmasin — ular umumiy bo'lib qoladi.
      await tx.galleryAlbum.updateMany({
        where: { menuPackageId: id },
        data: { menuPackageId: null },
      });
      await this.audit.log(
        {
          action: 'menu.package_delete',
          resource: 'menu_package',
          resourceId: id,
          before: packageAudit(packageView(pkg)),
        },
        tx,
      );
    });
  }

  async reorderPackages(ids: string[]) {
    const existing = await this.prisma.menuPackage.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    this.assertSamePermutation(
      ids,
      existing.map((pkg) => pkg.id),
    );

    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.menuPackage.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    return this.listPackages();
  }

  async priceHistory(id: string) {
    await this.findPackage(id);
    const prices = await this.prisma.menuPackagePrice.findMany({
      where: { packageId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return prices.map((row) => ({ price: moneyString(row.price), changedAt: row.createdAt }));
  }

  // ── Yordamchilar ─────────────────────────────────────────────────────────

  private async withCover(pkg: PackageRecord) {
    return {
      ...packageView(pkg),
      cover: await this.photos.urls(pkg.coverKey, pkg.coverThumbKey),
    };
  }

  private async findCategory(id: string): Promise<MenuCategory> {
    const category = await this.prisma.menuCategory.findFirst({ where: { id, deletedAt: null } });
    if (!category) throw categoryNotFound();
    return category;
  }

  private async findPackage(id: string): Promise<PackageRecord> {
    const pkg = await this.prisma.menuPackage.findFirst({
      where: { id, deletedAt: null },
      include: PACKAGE_INCLUDE,
    });
    if (!pkg) throw packageNotFound();
    return pkg;
  }

  private async validSections(sections: MenuSectionDto[]) {
    const ids = sections.map((section) => section.categoryId);
    const found = await this.prisma.menuCategory.count({
      where: { id: { in: ids }, deletedAt: null },
    });
    if (found !== ids.length) throw categoryNotFound();

    return sections.map((section) => ({
      categoryId: section.categoryId,
      kindsCount: section.kindsCount,
      items: section.items ?? [],
    }));
  }

  private async assertCategoryNameFree(nameUz: string, exceptId?: string): Promise<void> {
    const existing = await this.prisma.menuCategory.findFirst({
      where: {
        deletedAt: null,
        nameUz: { equals: nameUz, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (existing) {
      throw AppException.conflict('MENU_CATEGORY_NAME_TAKEN', "Bunday nomli bo'lim mavjud");
    }
  }

  private async assertPackageNameFree(name: string, exceptId?: string): Promise<void> {
    const existing = await this.prisma.menuPackage.findFirst({
      where: {
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (existing) {
      throw AppException.conflict('MENU_PACKAGE_NAME_TAKEN', 'Bunday nomli paket mavjud');
    }
  }

  private assertSamePermutation(ids: string[], existing: string[]): void {
    const known = new Set(existing);
    if (ids.length !== known.size || !ids.every((id) => known.has(id))) {
      throw AppException.badRequest(
        'REORDER_INVALID',
        "Ro'yxatda barcha elementlar aynan bir martadan bo'lishi kerak",
      );
    }
  }
}
