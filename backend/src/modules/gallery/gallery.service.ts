import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { MediaKind, MediaProcessingStatus, Prisma } from '@prisma/client';
import sharp from 'sharp';
import { AppException } from '@/common/errors/app.exception';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { processImage } from '@/infrastructure/storage/image-processor';
import { StorageBucket, StorageService } from '@/infrastructure/storage/storage.service';
import {
  extractPoster,
  probeDuration,
  sniffVideoFormat,
} from '@/infrastructure/storage/video-probe';
import { AuditService } from '@/modules/audit/audit.service';
import {
  CompleteVideoUploadDto,
  CreateAlbumDto,
  InitVideoUploadDto,
  MAX_ALBUM_ITEMS,
  UpdateAlbumDto,
} from './dto/gallery.dto';
import { VideoProcessingService } from './video-processing.service';

const ALBUM_INCLUDE = {
  items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.GalleryAlbumInclude;

type AlbumRecord = Prisma.GalleryAlbumGetPayload<{ include: typeof ALBUM_INCLUDE }>;
type ItemRecord = AlbumRecord['items'][number];

/** Rasmlar `derivatives`da; videolar (asl va qayta ishlangan nusxasi) `originals`da saqlanadi. */
const bucketOf = (kind: MediaKind): StorageBucket =>
  kind === MediaKind.VIDEO ? 'originals' : 'derivatives';

const EXTENSION: Record<InitVideoUploadDto['contentType'], string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

const albumNotFound = () => AppException.notFound('ALBUM_NOT_FOUND', 'Albom topilmadi');

@Injectable()
export class GalleryService {
  private readonly logger = new Logger(GalleryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly videos: VideoProcessingService,
  ) {}

  async listAlbums() {
    const albums = await this.prisma.galleryAlbum.findMany({
      where: { deletedAt: null },
      include: ALBUM_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return Promise.all(albums.map((album) => this.albumView(album)));
  }

  async createAlbum(dto: CreateAlbumDto) {
    const last = await this.prisma.galleryAlbum.aggregate({
      where: { deletedAt: null },
      _max: { sortOrder: true },
    });
    await this.assertPackageExists(dto.menuPackageId);
    const album = await this.prisma.$transaction(async (tx) => {
      const created = await tx.galleryAlbum.create({
        data: {
          title: dto.title,
          description: dto.description || null,
          menuPackageId: dto.menuPackageId ?? null,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
        include: ALBUM_INCLUDE,
      });
      await this.audit.log(
        {
          action: 'gallery.album_create',
          resource: 'gallery_album',
          resourceId: created.id,
          after: dto,
        },
        tx,
      );
      return created;
    });
    return this.albumView(album);
  }

  async updateAlbum(id: string, dto: UpdateAlbumDto) {
    await this.findAlbum(id);
    await this.assertPackageExists(dto.menuPackageId);
    const album = await this.prisma.galleryAlbum.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description || null }),
        ...(dto.menuPackageId !== undefined && { menuPackageId: dto.menuPackageId }),
      },
      include: ALBUM_INCLUDE,
    });
    await this.audit.log({
      action: 'gallery.album_update',
      resource: 'gallery_album',
      resourceId: id,
      after: dto,
    });
    return this.albumView(album);
  }

  /** Albom ichidagi fayllar bilan birga o'chiriladi. */
  async removeAlbum(id: string): Promise<void> {
    const album = await this.findAlbum(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.galleryItem.deleteMany({ where: { albumId: id } });
      await tx.galleryAlbum.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(
        {
          action: 'gallery.album_delete',
          resource: 'gallery_album',
          resourceId: id,
          before: { title: album.title, items: album.items.length },
        },
        tx,
      );
    });
    await Promise.all(album.items.map((item) => this.removeObjects(item)));
  }

  async addImage(albumId: string, file: Express.Multer.File | undefined) {
    if (!file) throw AppException.badRequest('FILE_REQUIRED', 'Rasm fayli yuborilmagan');
    await this.assertHasRoom(albumId);

    const { full, thumb } = await processImage(file.buffer);
    const itemId = randomUUID();
    const objectKey = `gallery/${albumId}/${itemId}.webp`;
    const thumbKey = `gallery/${albumId}/${itemId}-thumb.webp`;
    await Promise.all([
      this.storage.put('derivatives', objectKey, full.buffer, 'image/webp'),
      this.storage.put('derivatives', thumbKey, thumb.buffer, 'image/webp'),
    ]);

    try {
      await this.prisma.galleryItem.create({
        data: {
          id: itemId,
          albumId,
          kind: MediaKind.IMAGE,
          objectKey,
          thumbKey,
          mimeType: 'image/webp',
          width: full.width,
          height: full.height,
          sizeBytes: full.buffer.length,
        },
      });
    } catch (error) {
      await this.storage.remove('derivatives', [objectKey, thumbKey]).catch(() => undefined);
      throw error;
    }
    await this.audit.log({
      action: 'gallery.item_add',
      resource: 'gallery_album',
      resourceId: albumId,
      after: { itemId, kind: MediaKind.IMAGE },
    });
    return this.albumView(await this.findAlbum(albumId));
  }

  /** 1-qadam: brauzer videoni to'g'ridan-to'g'ri saqlash joyiga yuklashi uchun havola. */
  async initVideoUpload(albumId: string, dto: InitVideoUploadDto) {
    await this.assertHasRoom(albumId);
    const key = `gallery/${albumId}/${randomUUID()}.${EXTENSION[dto.contentType]}`;
    return {
      key,
      uploadUrl: await this.storage.presignedUploadUrl('originals', key, dto.contentType),
    };
  }

  /**
   * 2-qadam: yuklangan fayl tekshiriladi (haqiqatan videomi, hajmi) va albomga
   * qo'shiladi. Muqova ffmpeg yordamida birinchi kadrlardan olinadi. So'ng video
   * fonda qayta ishlanadi (`processingStatus`); shu paytda ham asl fayl o'ynayveradi.
   */
  async completeVideoUpload(albumId: string, dto: CompleteVideoUploadDto) {
    if (!dto.key.startsWith(`gallery/${albumId}/`)) {
      throw AppException.badRequest(
        'UPLOAD_KEY_INVALID',
        'Yuklash kaliti bu albomga tegishli emas',
      );
    }
    await this.assertHasRoom(albumId);

    const size = await this.storage.size('originals', dto.key);
    if (size === null) {
      throw AppException.badRequest(
        'UPLOAD_NOT_FOUND',
        'Fayl yuklanmagan. Qaytadan urinib ko‘ring',
      );
    }
    const format = sniffVideoFormat(await this.storage.readHead('originals', dto.key));
    if (!format) {
      await this.storage.remove('originals', [dto.key]).catch(() => undefined);
      throw AppException.badRequest('INVALID_VIDEO', 'Fayl video emas. MP4, MOV yoki WebM yuklang');
    }

    const url = await this.storage.internalUrl('originals', dto.key);
    const [frame, durationSec] = await Promise.all([extractPoster(url), probeDuration(url)]);
    const itemId = randomUUID();
    let thumbKey: string | null = null;
    let dimensions: { width?: number; height?: number } = {};

    if (frame) {
      const metadata = await sharp(frame).metadata();
      dimensions = { width: metadata.width, height: metadata.height };
      const poster = await sharp(frame)
        .resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      thumbKey = `gallery/${albumId}/${itemId}-poster.webp`;
      await this.storage.put('derivatives', thumbKey, poster, 'image/webp');
    }

    try {
      await this.prisma.galleryItem.create({
        data: {
          id: itemId,
          albumId,
          kind: MediaKind.VIDEO,
          objectKey: dto.key,
          thumbKey,
          mimeType:
            format === 'webm'
              ? 'video/webm'
              : (MIME_BY_EXTENSION[dto.key.split('.').pop() ?? ''] ?? 'video/mp4'),
          sizeBytes: size,
          durationSec,
          ...dimensions,
        },
      });
    } catch (error) {
      // Kalit takrorlangan (ikki marta "complete") yoki baza xatosi.
      if (thumbKey) await this.storage.remove('derivatives', [thumbKey]).catch(() => undefined);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppException.conflict('UPLOAD_ALREADY_COMPLETED', 'Bu video allaqachon qo‘shilgan');
      }
      throw error;
    }
    await this.audit.log({
      action: 'gallery.item_add',
      resource: 'gallery_album',
      resourceId: albumId,
      after: { itemId, kind: MediaKind.VIDEO, sizeBytes: size },
    });
    await this.videos.schedule(itemId);
    return this.albumView(await this.findAlbum(albumId));
  }

  /** Qayta ishlash muvaffaqiyatsiz tugagan videoni yana navbatga qo'yadi. */
  async reprocessVideo(albumId: string, itemId: string) {
    const item = await this.prisma.galleryItem.findFirst({ where: { id: itemId, albumId } });
    if (!item) throw AppException.notFound('GALLERY_ITEM_NOT_FOUND', 'Fayl topilmadi');
    if (item.kind !== MediaKind.VIDEO || item.processingStatus !== MediaProcessingStatus.FAILED) {
      throw AppException.conflict(
        'VIDEO_REPROCESS_NOT_NEEDED',
        'Bu faylni qayta ishlash kerak emas',
      );
    }
    await this.videos.schedule(itemId);
    return this.albumView(await this.findAlbum(albumId));
  }

  async removeItem(albumId: string, itemId: string) {
    const item = await this.prisma.galleryItem.findFirst({ where: { id: itemId, albumId } });
    if (!item) throw AppException.notFound('GALLERY_ITEM_NOT_FOUND', 'Fayl topilmadi');

    await this.prisma.galleryItem.delete({ where: { id: itemId } });
    await this.removeObjects(item);
    await this.audit.log({
      action: 'gallery.item_remove',
      resource: 'gallery_album',
      resourceId: albumId,
      before: { itemId, kind: item.kind },
    });
    return this.albumView(await this.findAlbum(albumId));
  }

  private async findAlbum(id: string): Promise<AlbumRecord> {
    const album = await this.prisma.galleryAlbum.findFirst({
      where: { id, deletedAt: null },
      include: ALBUM_INCLUDE,
    });
    if (!album) throw albumNotFound();
    return album;
  }

  private async assertPackageExists(menuPackageId: string | null | undefined): Promise<void> {
    if (!menuPackageId) return;
    const pkg = await this.prisma.menuPackage.findFirst({
      where: { id: menuPackageId, deletedAt: null },
      select: { id: true },
    });
    if (!pkg) throw AppException.notFound('MENU_PACKAGE_NOT_FOUND', 'Menyu paketi topilmadi');
  }

  private async assertHasRoom(albumId: string): Promise<void> {
    const album = await this.findAlbum(albumId);
    if (album.items.length >= MAX_ALBUM_ITEMS) {
      throw AppException.conflict(
        'ALBUM_FULL',
        `Bitta albomga ko'pi bilan ${MAX_ALBUM_ITEMS} ta fayl yuklash mumkin`,
        { limit: MAX_ALBUM_ITEMS },
      );
    }
  }

  private async removeObjects(item: ItemRecord): Promise<void> {
    try {
      await this.storage.remove(bucketOf(item.kind), [item.objectKey]);
      if (item.thumbKey) await this.storage.remove('derivatives', [item.thumbKey]);
    } catch (error) {
      this.logger.error({ err: error, itemId: item.id }, "Galereya faylini o'chirib bo'lmadi");
    }
  }

  private async albumView(album: AlbumRecord) {
    const items = await Promise.all(
      album.items.map(async (item) => ({
        id: item.id,
        kind: item.kind,
        url: await this.storage.signedUrl(bucketOf(item.kind), item.objectKey),
        thumbUrl: item.thumbKey ? await this.storage.signedUrl('derivatives', item.thumbKey) : null,
        mimeType: item.mimeType,
        width: item.width,
        height: item.height,
        sizeBytes: Number(item.sizeBytes),
        durationSec: item.durationSec,
        processingStatus: item.processingStatus,
      })),
    );
    return {
      id: album.id,
      title: album.title,
      description: album.description,
      menuPackageId: album.menuPackageId,
      sortOrder: album.sortOrder,
      items,
    };
  }
}
