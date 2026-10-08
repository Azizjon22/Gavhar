import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '@/common/errors/app.exception';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { processImage } from '@/infrastructure/storage/image-processor';
import { StorageService } from '@/infrastructure/storage/storage.service';
import { auditDiff } from '@/modules/audit/audit-sanitizer';
import { AuditService } from '@/modules/audit/audit.service';
import {
  CreateHallDto,
  ListHallsDto,
  MAX_HALL_IMAGES,
  ReorderHallImagesDto,
  UpdateHallDto,
} from './dto/hall.dto';

const HALL_INCLUDE = {
  images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.HallInclude;

type HallRecord = Prisma.HallGetPayload<{ include: typeof HALL_INCLUDE }>;

const IMAGE_BUCKET = 'derivatives';

const notFound = () => AppException.notFound('HALL_NOT_FOUND', 'Zal topilmadi');
const imageNotFound = () => AppException.notFound('HALL_IMAGE_NOT_FOUND', 'Rasm topilmadi');

/** Audit log uchun solishtiriladigan maydonlar. */
const auditFields = (hall: HallRecord) => ({
  name: hall.name,
  capacity: hall.capacity,
  description: hall.description,
  status: hall.status,
});

@Injectable()
export class HallsService {
  private readonly logger = new Logger(HallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListHallsDto) {
    const halls = await this.prisma.hall.findMany({
      where: {
        deletedAt: null,
        ...(query.status && { status: query.status }),
        ...(query.search && { name: { contains: query.search, mode: 'insensitive' } }),
      },
      include: HALL_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return Promise.all(halls.map((hall) => this.toView(hall)));
  }

  async findOne(id: string) {
    return this.toView(await this.findRecord(id));
  }

  async create(dto: CreateHallDto) {
    await this.assertNameAvailable(dto.name);

    const hall = await this.prisma.$transaction(async (tx) => {
      const created = await tx.hall.create({
        data: {
          name: dto.name,
          capacity: dto.capacity,
          description: dto.description || null,
          status: dto.status,
        },
        include: HALL_INCLUDE,
      });
      await this.audit.log(
        {
          action: 'hall.create',
          resource: 'hall',
          resourceId: created.id,
          after: auditFields(created),
        },
        tx,
      );
      return created;
    });
    return this.toView(hall);
  }

  async update(id: string, dto: UpdateHallDto) {
    const before = await this.findRecord(id);
    if (dto.name !== undefined && dto.name.toLowerCase() !== before.name.toLowerCase()) {
      await this.assertNameAvailable(dto.name, id);
    }

    const hall = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.hall.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.capacity !== undefined && { capacity: dto.capacity }),
          ...(dto.description !== undefined && { description: dto.description || null }),
          ...(dto.status !== undefined && { status: dto.status }),
        },
        include: HALL_INCLUDE,
      });
      const diff = auditDiff(auditFields(before), auditFields(updated));
      if (diff) {
        await this.audit.log(
          { action: 'hall.update', resource: 'hall', resourceId: id, ...diff },
          tx,
        );
      }
      return updated;
    });
    return this.toView(hall);
  }

  async remove(id: string): Promise<void> {
    const hall = await this.findRecord(id);
    const activeEvents = await this.prisma.event.count({
      where: { hallId: id, deletedAt: null, status: { in: ['REQUEST', 'CONFIRMED', 'HELD'] } },
    });
    if (activeEvents > 0) {
      throw AppException.conflict(
        'HALL_HAS_EVENTS',
        'Bu zalda yopilmagan bronlar bor. Avval ularni yakunlang yoki bekor qiling',
        { count: activeEvents },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.hall.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(
        { action: 'hall.delete', resource: 'hall', resourceId: id, before: auditFields(hall) },
        tx,
      );
    });
  }

  async addImage(id: string, file: Express.Multer.File | undefined) {
    if (!file) {
      throw AppException.badRequest('FILE_REQUIRED', 'Rasm fayli yuborilmagan');
    }
    const hall = await this.findRecord(id);
    if (hall.images.length >= MAX_HALL_IMAGES) {
      throw AppException.conflict(
        'HALL_IMAGE_LIMIT',
        `Bitta zalga ko'pi bilan ${MAX_HALL_IMAGES} ta rasm yuklash mumkin`,
        { limit: MAX_HALL_IMAGES },
      );
    }

    const { full, thumb } = await processImage(file.buffer);
    const imageId = randomUUID();
    const objectKey = `halls/${id}/${imageId}.webp`;
    const thumbKey = `halls/${id}/${imageId}-thumb.webp`;

    await Promise.all([
      this.storage.put(IMAGE_BUCKET, objectKey, full.buffer, 'image/webp'),
      this.storage.put(IMAGE_BUCKET, thumbKey, thumb.buffer, 'image/webp'),
    ]);

    try {
      const lastOrder = hall.images.at(-1)?.sortOrder ?? -1;
      await this.prisma.$transaction(async (tx) => {
        await tx.hallImage.create({
          data: {
            id: imageId,
            hallId: id,
            objectKey,
            thumbKey,
            width: full.width,
            height: full.height,
            sizeBytes: full.buffer.length,
            sortOrder: lastOrder + 1,
          },
        });
        await this.audit.log(
          { action: 'hall.image_add', resource: 'hall', resourceId: id, after: { imageId } },
          tx,
        );
      });
    } catch (error) {
      // Baza yozuvi bo'lmasa, yuklangan fayllar "yetim" bo'lib qolmasin.
      await this.removeObjects([objectKey, thumbKey]);
      throw error;
    }

    return this.findOne(id);
  }

  async removeImage(id: string, imageId: string) {
    const hall = await this.findRecord(id);
    const image = hall.images.find((item) => item.id === imageId);
    if (!image) throw imageNotFound();

    await this.prisma.$transaction(async (tx) => {
      await tx.hallImage.delete({ where: { id: imageId } });
      await this.audit.log(
        { action: 'hall.image_remove', resource: 'hall', resourceId: id, before: { imageId } },
        tx,
      );
    });
    await this.removeObjects([image.objectKey, image.thumbKey]);

    return this.findOne(id);
  }

  async reorderImages(id: string, dto: ReorderHallImagesDto) {
    const hall = await this.findRecord(id);
    const existing = new Set(hall.images.map((image) => image.id));
    const samePermutation =
      dto.imageIds.length === existing.size &&
      dto.imageIds.every((imageId) => existing.has(imageId));
    if (!samePermutation) {
      throw AppException.badRequest(
        'HALL_IMAGE_ORDER_INVALID',
        "Ro'yxatda zalning barcha rasmlari aynan bir martadan bo'lishi kerak",
      );
    }

    await this.prisma.$transaction(
      dto.imageIds.map((imageId, index) =>
        this.prisma.hallImage.update({ where: { id: imageId }, data: { sortOrder: index } }),
      ),
    );
    return this.findOne(id);
  }

  private async findRecord(id: string): Promise<HallRecord> {
    const hall = await this.prisma.hall.findFirst({
      where: { id, deletedAt: null },
      include: HALL_INCLUDE,
    });
    if (!hall) throw notFound();
    return hall;
  }

  private async assertNameAvailable(name: string, exceptId?: string): Promise<void> {
    const existing = await this.prisma.hall.findFirst({
      where: {
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (existing) {
      throw AppException.conflict('HALL_NAME_TAKEN', 'Bunday nomli zal mavjud');
    }
  }

  /** Fayl o'chmasa asosiy amal buzilmaydi — faqat logga yoziladi. */
  private async removeObjects(keys: string[]): Promise<void> {
    try {
      await this.storage.remove(IMAGE_BUCKET, keys);
    } catch (error) {
      this.logger.error({ err: error, keys }, "Saqlash joyidan fayllarni o'chirib bo'lmadi");
    }
  }

  private async toView(hall: HallRecord) {
    const images = await Promise.all(
      hall.images.map(async (image) => ({
        id: image.id,
        url: await this.storage.signedUrl(IMAGE_BUCKET, image.objectKey),
        thumbUrl: await this.storage.signedUrl(IMAGE_BUCKET, image.thumbKey),
        width: image.width,
        height: image.height,
      })),
    );

    return {
      id: hall.id,
      name: hall.name,
      capacity: hall.capacity,
      description: hall.description,
      status: hall.status,
      images,
      createdAt: hall.createdAt,
      updatedAt: hall.updatedAt,
    };
  }
}
