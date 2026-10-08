import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { MediaKind, MediaProcessingStatus } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { StorageService } from '@/infrastructure/storage/storage.service';
import {
  displaySize,
  planVideo,
  probeVideo,
  remuxArgs,
  runTool,
  startsWithIndex,
  transcodeArgs,
} from '@/infrastructure/storage/video-optimizer';

/**
 * Yuklangan videoni hamma qurilmada darhol va silliq o'ynaydigan holga keltiradi:
 * kerak bo'lsa indeksini boshiga ko'chiradi yoki H.264/AAC MP4 (1080p gacha) qilib
 * qayta kodlaydi. Ish fonda bajariladi; asl fayl yangisi tayyor bo'lguncha saqlanadi.
 */
@Injectable()
export class VideoProcessingService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(VideoProcessingService.name);
  /** Bir vaqtda bitta video: ikkita kodlash birdaniga serverning o'zini sekinlashtiradi. */
  private queue: Promise<void> = Promise.resolve();
  private readonly shutdown = new AbortController();
  private installed: Promise<boolean> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Server qayta ishlash o'rtasida o'chgan bo'lsa, qator PROCESSING holatida qolib
   * ketadi. Asl fayl joyida — har birini qaytadan navbatga qo'yamiz.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const stuck = await this.prisma.galleryItem.findMany({
        where: { kind: MediaKind.VIDEO, processingStatus: MediaProcessingStatus.PROCESSING },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (stuck.length === 0) return;
      if (!(await this.available())) {
        await this.prisma.galleryItem.updateMany({
          where: { id: { in: stuck.map((item) => item.id) } },
          data: { processingStatus: MediaProcessingStatus.READY },
        });
        return;
      }
      for (const item of stuck) this.enqueue(item.id);
    } catch (error) {
      // Navbatni tiklab bo'lmagani serverning ishga tushishiga to'sqinlik qilmasin.
      this.logger.error({ err: error }, "Chala qolgan videolarni navbatga qo'yib bo'lmadi");
    }
  }

  onModuleDestroy(): void {
    this.shutdown.abort();
  }

  /**
   * Videoni navbatga qo'yadi va uni PROCESSING deb belgilaydi. ffmpeg o'rnatilmagan
   * bo'lsa hech narsa qilinmaydi — video yuklangan holicha (READY) qoladi.
   */
  async schedule(itemId: string): Promise<MediaProcessingStatus> {
    const status = (await this.available())
      ? MediaProcessingStatus.PROCESSING
      : MediaProcessingStatus.READY;
    await this.prisma.galleryItem.update({
      where: { id: itemId },
      data: { processingStatus: status },
    });
    if (status === MediaProcessingStatus.PROCESSING) this.enqueue(itemId);
    return status;
  }

  /** Navbatdagi barcha ishlar tugaganda bajariladi (testlar uchun). */
  idle(): Promise<void> {
    return this.queue;
  }

  private available(): Promise<boolean> {
    this.installed ??= Promise.all([
      runTool('ffprobe', ['-version']),
      runTool('ffmpeg', ['-version']),
    ]).then(
      () => true,
      () => {
        this.logger.warn(
          'ffmpeg topilmadi — videolar qayta ishlanmay, yuklangan holicha saqlanadi',
        );
        return false;
      },
    );
    return this.installed;
  }

  private enqueue(itemId: string): void {
    this.queue = this.queue.then(() => this.process(itemId));
  }

  private async process(itemId: string): Promise<void> {
    const signal = this.shutdown.signal;
    if (signal.aborted) return;
    let scratch: string | null = null;
    try {
      const item = await this.prisma.galleryItem.findUnique({ where: { id: itemId } });
      // Video shu orada o'chirilgan bo'lishi mumkin.
      if (!item || item.processingStatus !== MediaProcessingStatus.PROCESSING) return;

      scratch = await mkdtemp(join(tmpdir(), 'gavhar-video-'));
      const extension = extname(item.objectKey).toLowerCase();
      const input = join(scratch, `in${extension}`);
      const output = join(scratch, 'out.mp4');
      await this.storage.download('originals', item.objectKey, input);

      const probe = await probeVideo(input, signal);
      if (!probe) throw new Error('faylda video oqimi topilmadi');
      const plan = planVideo(probe, {
        isMp4: extension === '.mp4',
        indexFirst: await startsWithIndex(input),
      });
      if (plan.action === 'keep') {
        await this.prisma.galleryItem.updateMany({
          where: { id: itemId, processingStatus: MediaProcessingStatus.PROCESSING },
          data: { processingStatus: MediaProcessingStatus.READY, ...displaySize(probe) },
        });
        return;
      }

      await runTool(
        'ffmpeg',
        plan.action === 'remux'
          ? remuxArgs(input, output)
          : transcodeArgs(input, output, plan.scale),
        signal,
      );
      const result = await probeVideo(output, signal);
      if (!result) throw new Error("qayta ishlangan faylni o'qib bo'lmadi");

      // Har doim yangi nom: brauzer keshidagi eski nusxa ko'rsatilib qolmaydi.
      const key = `gallery/${item.albumId}/${randomUUID()}.mp4`;
      const sizeBytes = await this.storage.putFile('originals', key, output, 'video/mp4');
      const { count } = await this.prisma.galleryItem.updateMany({
        where: { id: itemId, objectKey: item.objectKey },
        data: {
          objectKey: key,
          mimeType: 'video/mp4',
          sizeBytes,
          processingStatus: MediaProcessingStatus.READY,
          ...displaySize(result),
        },
      });
      // Qator o'chirilgan bo'lsa yangi fayl ham keraksiz.
      await this.storage
        .remove('originals', [count > 0 ? item.objectKey : key])
        .catch(() => undefined);
      this.logger.log(`Video ${itemId} qayta ishlandi (${plan.action})`);
    } catch (error) {
      // Server o'chayotgan bo'lsa qator PROCESSING qoladi — keyingi ishga tushishda davom etadi.
      if (signal.aborted) return;
      this.logger.error({ err: error, itemId }, "Videoni qayta ishlab bo'lmadi");
      await this.prisma.galleryItem
        .updateMany({
          where: { id: itemId, processingStatus: MediaProcessingStatus.PROCESSING },
          data: { processingStatus: MediaProcessingStatus.FAILED },
        })
        .catch(() => undefined);
    } finally {
      if (scratch) await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
