import { Injectable } from '@nestjs/common';
import { EventStatus, Prisma, Worker } from '@prisma/client';
import { AppException } from '@/common/errors/app.exception';
import { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { PhotoService } from '@/infrastructure/storage/photo.service';
import { auditDiff } from '@/modules/audit/audit-sanitizer';
import { AuditService } from '@/modules/audit/audit.service';
import {
  AssignWorkerDto,
  CreateWorkerDto,
  ListWorkersQueryDto,
  UpdateWorkerDto,
} from './dto/worker.dto';

const auditFields = (worker: Worker) => ({
  fullName: worker.fullName,
  phone: worker.phone,
  position: worker.position,
  isActive: worker.isActive,
  note: worker.note,
});

const notFound = () => AppException.notFound('WORKER_NOT_FOUND', 'Ishchi topilmadi');

/**
 * To'yxona ishchilari (ofitsiant, oshpaz va boshqalar) ro'yxati va ularni to'ylarga
 * biriktirish. Ishchilar tizimga kirmaydi — ularni zavzal yoki admin yuritadi.
 */
@Injectable()
export class WorkersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly photos: PhotoService,
  ) {}

  async list(query: ListWorkersQueryDto) {
    const workers = await this.prisma.worker.findMany({
      where: { deletedAt: null, ...(query.position && { position: query.position }) },
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
      include: {
        // Oldinda nechta to'yga biriktirilgani — bandligini ko'rish uchun.
        _count: {
          select: {
            assignments: {
              where: {
                event: {
                  deletedAt: null,
                  status: { not: EventStatus.CANCELLED },
                  endAt: { gte: new Date() },
                },
              },
            },
          },
        },
      },
    });
    return Promise.all(
      workers.map(async ({ _count, ...worker }) => ({
        ...(await this.view(worker)),
        upcomingEvents: _count.assignments,
      })),
    );
  }

  async create(dto: CreateWorkerDto) {
    await this.assertPhoneAvailable(dto.phone);
    return this.prisma.$transaction(async (tx) => {
      const worker = await tx.worker.create({
        data: {
          fullName: dto.fullName,
          phone: dto.phone,
          position: dto.position,
          note: dto.note || null,
          isActive: dto.isActive ?? true,
        },
      });
      await this.audit.log(
        {
          action: 'worker.create',
          resource: 'worker',
          resourceId: worker.id,
          after: auditFields(worker),
        },
        tx,
      );
      return this.view(worker);
    });
  }

  async update(id: string, dto: UpdateWorkerDto) {
    const before = await this.findRecord(id);
    if (dto.phone !== undefined && dto.phone !== before.phone) {
      await this.assertPhoneAvailable(dto.phone, id);
    }
    return this.prisma.$transaction(async (tx) => {
      const worker = await tx.worker.update({
        where: { id },
        data: {
          ...(dto.fullName !== undefined && { fullName: dto.fullName }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.position !== undefined && { position: dto.position }),
          ...(dto.note !== undefined && { note: dto.note || null }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });
      const diff = auditDiff(auditFields(before), auditFields(worker));
      if (diff) {
        await this.audit.log(
          { action: 'worker.update', resource: 'worker', resourceId: id, ...diff },
          tx,
        );
      }
      return this.view(worker);
    });
  }

  /** O'tgan to'ylardagi biriktiruvlar tarix sifatida qoladi — ishchi faqat ro'yxatdan yashiriladi. */
  async remove(id: string): Promise<void> {
    const worker = await this.findRecord(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.worker.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
      await this.audit.log(
        {
          action: 'worker.delete',
          resource: 'worker',
          resourceId: id,
          before: auditFields(worker),
        },
        tx,
      );
    });
  }

  async setPhoto(id: string, file: Express.Multer.File | undefined) {
    const worker = await this.findRecord(id);
    const photo = await this.photos.store(`workers/${id}`, file);
    const updated = await this.prisma.worker.update({
      where: { id },
      data: { photoKey: photo.objectKey, photoThumbKey: photo.thumbKey },
    });
    await this.photos.remove(worker.photoKey, worker.photoThumbKey);
    return this.view(updated);
  }

  async removePhoto(id: string) {
    const worker = await this.findRecord(id);
    const updated = await this.prisma.worker.update({
      where: { id },
      data: { photoKey: null, photoThumbKey: null },
    });
    await this.photos.remove(worker.photoKey, worker.photoThumbKey);
    return this.view(updated);
  }

  // ── To'yga biriktirish ───────────────────────────────────────────────────

  async listForEvent(eventId: string) {
    await this.findEvent(eventId);
    return this.assignmentsOf(eventId);
  }

  async assign(eventId: string, dto: AssignWorkerDto, actor: AuthUser) {
    const event = await this.findEvent(eventId);
    if (event.status === EventStatus.CANCELLED) {
      throw AppException.conflict(
        'EVENT_CANCELLED',
        'Bekor qilingan bronga ishchi biriktirilmaydi',
      );
    }
    const worker = await this.findRecord(dto.workerId);
    if (!worker.isActive) {
      throw AppException.conflict(
        'WORKER_INACTIVE',
        'Bu ishchi faol emas — avval uni faollashtiring',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.eventWorker.create({
          data: {
            eventId,
            workerId: worker.id,
            roleAtEvent: dto.roleAtEvent || null,
            assignedByName: actor.fullName,
          },
        });
        await this.audit.log(
          {
            action: 'worker.assign',
            resource: 'event',
            resourceId: eventId,
            after: { event: event.number, worker: worker.fullName, role: dto.roleAtEvent || null },
          },
          tx,
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppException.conflict(
          'WORKER_ALREADY_ASSIGNED',
          "Bu ishchi allaqachon shu to'yga biriktirilgan",
        );
      }
      throw error;
    }
    return this.assignmentsOf(eventId);
  }

  async unassign(eventId: string, workerId: string) {
    const event = await this.findEvent(eventId);
    const assignment = await this.prisma.eventWorker.findUnique({
      where: { eventId_workerId: { eventId, workerId } },
      include: { worker: { select: { fullName: true } } },
    });
    if (!assignment) {
      throw AppException.notFound('ASSIGNMENT_NOT_FOUND', "Bu ishchi shu to'yga biriktirilmagan");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.eventWorker.delete({ where: { id: assignment.id } });
      await this.audit.log(
        {
          action: 'worker.unassign',
          resource: 'event',
          resourceId: eventId,
          before: { event: event.number, worker: assignment.worker.fullName },
        },
        tx,
      );
    });
    return this.assignmentsOf(eventId);
  }

  // ── Yordamchi ────────────────────────────────────────────────────────────

  private async assignmentsOf(eventId: string) {
    const assignments = await this.prisma.eventWorker.findMany({
      where: { eventId },
      include: { worker: true },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(
      assignments.map(async (assignment) => ({
        roleAtEvent: assignment.roleAtEvent,
        assignedByName: assignment.assignedByName,
        assignedAt: assignment.createdAt,
        worker: await this.view(assignment.worker),
      })),
    );
  }

  private async view(worker: Worker) {
    return {
      id: worker.id,
      fullName: worker.fullName,
      phone: worker.phone,
      position: worker.position,
      note: worker.note,
      isActive: worker.isActive,
      photo: await this.photos.urls(worker.photoKey, worker.photoThumbKey),
      createdAt: worker.createdAt,
    };
  }

  private async findRecord(id: string): Promise<Worker> {
    const worker = await this.prisma.worker.findFirst({ where: { id, deletedAt: null } });
    if (!worker) throw notFound();
    return worker;
  }

  private async findEvent(eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { id: true, number: true, status: true },
    });
    if (!event) throw AppException.notFound('EVENT_NOT_FOUND', 'Bron topilmadi');
    return event;
  }

  private async assertPhoneAvailable(phone: string, exceptId?: string): Promise<void> {
    const taken = await this.prisma.worker.findFirst({
      where: { phone, deletedAt: null, ...(exceptId && { id: { not: exceptId } }) },
      select: { fullName: true },
    });
    if (taken) {
      throw AppException.conflict(
        'WORKER_PHONE_TAKEN',
        `Bu telefon raqam "${taken.fullName}" ishchisiga tegishli`,
        { name: taken.fullName },
      );
    }
  }
}
