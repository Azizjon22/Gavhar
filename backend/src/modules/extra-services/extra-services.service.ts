import { Injectable } from '@nestjs/common';
import { ExtraService, Prisma } from '@prisma/client';
import { AppException } from '@/common/errors/app.exception';
import { money, moneyString } from '@/common/utils/money.util';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { auditDiff } from '@/modules/audit/audit-sanitizer';
import { AuditService } from '@/modules/audit/audit.service';
import { CreateExtraServiceDto, UpdateExtraServiceDto } from './dto/extra-service.dto';

const toView = (service: ExtraService) => ({
  id: service.id,
  name: service.name,
  price: moneyString(service.price),
  unit: service.unit,
  isActive: service.isActive,
  createdAt: service.createdAt,
  updatedAt: service.updatedAt,
});

const auditFields = (service: ExtraService) => ({
  name: service.name,
  price: moneyString(service.price),
  unit: service.unit,
  isActive: service.isActive,
});

const notFound = () => AppException.notFound('EXTRA_SERVICE_NOT_FOUND', 'Xizmat topilmadi');

@Injectable()
export class ExtraServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const services = await this.prisma.extraService.findMany({
      where: { deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return services.map(toView);
  }

  async create(dto: CreateExtraServiceDto) {
    await this.assertNameAvailable(dto.name);

    return this.prisma.$transaction(async (tx) => {
      const service = await tx.extraService.create({
        data: { name: dto.name, price: money(dto.price), unit: dto.unit, isActive: dto.isActive },
      });
      await this.audit.log(
        {
          action: 'extra_service.create',
          resource: 'extra_service',
          resourceId: service.id,
          after: auditFields(service),
        },
        tx,
      );
      return toView(service);
    });
  }

  async update(id: string, dto: UpdateExtraServiceDto) {
    const before = await this.findRecord(id);
    if (dto.name !== undefined && dto.name.toLowerCase() !== before.name.toLowerCase()) {
      await this.assertNameAvailable(dto.name, id);
    }

    return this.prisma.$transaction(async (tx) => {
      const service = await tx.extraService.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.price !== undefined && { price: money(dto.price) }),
          ...(dto.unit !== undefined && { unit: dto.unit }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });
      const diff = auditDiff(auditFields(before), auditFields(service));
      if (diff) {
        await this.audit.log(
          { action: 'extra_service.update', resource: 'extra_service', resourceId: id, ...diff },
          tx,
        );
      }
      return toView(service);
    });
  }

  /** Eski bronlardagi nusxalar saqlanib qoladi — katalogdan faqat yashiriladi. */
  async remove(id: string): Promise<void> {
    const service = await this.findRecord(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.extraService.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
      await this.audit.log(
        {
          action: 'extra_service.delete',
          resource: 'extra_service',
          resourceId: id,
          before: auditFields(service),
        },
        tx,
      );
    });
  }

  private async findRecord(id: string): Promise<ExtraService> {
    const service = await this.prisma.extraService.findFirst({ where: { id, deletedAt: null } });
    if (!service) throw notFound();
    return service;
  }

  private async assertNameAvailable(name: string, exceptId?: string): Promise<void> {
    const where: Prisma.ExtraServiceWhereInput = {
      deletedAt: null,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId && { id: { not: exceptId } }),
    };
    if (await this.prisma.extraService.findFirst({ where, select: { id: true } })) {
      throw AppException.conflict('EXTRA_SERVICE_NAME_TAKEN', 'Bunday nomli xizmat mavjud');
    }
  }
}
