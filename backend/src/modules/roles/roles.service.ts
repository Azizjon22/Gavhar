import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomToken } from '@/common/crypto/token.util';
import { AppException } from '@/common/errors/app.exception';
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  SYSTEM_ROLES,
} from '@/common/permissions/permission-catalog';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { auditDiff } from '@/modules/audit/audit-sanitizer';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthContextService } from '@/modules/auth/services/auth-context.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

const ROLE_INCLUDE = {
  permissions: { select: { permission: { select: { key: true } } } },
  _count: { select: { users: { where: { deletedAt: null } } } },
} satisfies Prisma.RoleInclude;

type RoleRecord = Prisma.RoleGetPayload<{ include: typeof ROLE_INCLUDE }>;

const toRoleView = (role: RoleRecord) => ({
  id: role.id,
  key: role.key,
  name: role.name,
  description: role.description,
  isSystem: role.isSystem,
  // SUPER_ADMIN ruxsatlari bazada saqlanmaydi — u har doim hammasiga ega.
  permissions:
    role.key === SYSTEM_ROLES.SUPER_ADMIN
      ? [...ALL_PERMISSION_KEYS]
      : role.permissions.map((rp) => rp.permission.key).sort(),
  usersCount: role._count.users,
  createdAt: role.createdAt,
  updatedAt: role.updatedAt,
});

export type RoleView = ReturnType<typeof toRoleView>;

const notFound = () => AppException.notFound('ROLE_NOT_FOUND', 'Rol topilmadi');

const buildRoleKey = (name: string): string => {
  const slug = name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 30);
  return `CUSTOM_${slug || 'ROLE'}_${randomToken(4)
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()}`;
};

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authContext: AuthContextService,
    private readonly audit: AuditService,
  ) {}

  /** Ruxsatlar katalogi — rol formasi uchun resurs bo'yicha guruhlangan. */
  permissionCatalog() {
    const groups = new Map<string, { key: string; action: string; description: string }[]>();
    for (const { key, resource, action, description } of PERMISSION_CATALOG) {
      const group = groups.get(resource) ?? [];
      group.push({ key, action, description });
      groups.set(resource, group);
    }
    return [...groups].map(([resource, permissions]) => ({ resource, permissions }));
  }

  async list(): Promise<RoleView[]> {
    const roles = await this.prisma.role.findMany({
      include: ROLE_INCLUDE,
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
    return roles.map(toRoleView);
  }

  async findOne(id: string): Promise<RoleView> {
    const role = await this.prisma.role.findUnique({ where: { id }, include: ROLE_INCLUDE });
    if (!role) throw notFound();
    return toRoleView(role);
  }

  async create(dto: CreateRoleDto): Promise<RoleView> {
    await this.assertNameAvailable(dto.name);

    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          key: buildRoleKey(dto.name),
          name: dto.name,
          description: dto.description ?? null,
          permissions: {
            create: await this.permissionLinks(tx, dto.permissions),
          },
        },
        include: ROLE_INCLUDE,
      });
      const view = toRoleView(created);
      await this.audit.log(
        {
          action: 'role.create',
          resource: 'role',
          resourceId: view.id,
          after: { name: view.name, description: view.description, permissions: view.permissions },
        },
        tx,
      );
      return view;
    });

    return role;
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleView> {
    const before = await this.findOne(id);

    if (before.key === SYSTEM_ROLES.SUPER_ADMIN) {
      throw AppException.badRequest(
        'SYSTEM_ROLE_IMMUTABLE',
        "SUPER_ADMIN rolini o'zgartirib bo'lmaydi",
      );
    }
    if (before.isSystem && dto.name !== undefined && dto.name !== before.name) {
      throw AppException.badRequest(
        'SYSTEM_ROLE_IMMUTABLE',
        "Tizim rolining nomini o'zgartirib bo'lmaydi",
      );
    }
    if (dto.name !== undefined && dto.name !== before.name) {
      await this.assertNameAvailable(dto.name, id);
    }

    const role = await this.prisma.$transaction(async (tx) => {
      if (dto.permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
      }
      const updated = await tx.role.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.permissions && {
            permissions: { create: await this.permissionLinks(tx, dto.permissions) },
          }),
        },
        include: ROLE_INCLUDE,
      });
      const view = toRoleView(updated);

      const diff = auditDiff(
        { name: before.name, description: before.description, permissions: before.permissions },
        { name: view.name, description: view.description, permissions: view.permissions },
      );
      if (diff) {
        await this.audit.log(
          { action: 'role.update', resource: 'role', resourceId: id, ...diff },
          tx,
        );
      }
      return view;
    });

    // Shu roldagi foydalanuvchilar yangi ruxsatlarni keyingi so'rovdayoq oladi.
    await this.authContext.invalidateRole(id);
    return role;
  }

  async remove(id: string): Promise<void> {
    const role = await this.findOne(id);
    if (role.isSystem) {
      throw AppException.badRequest('SYSTEM_ROLE_IMMUTABLE', "Tizim rolini o'chirib bo'lmaydi");
    }
    if (role.usersCount > 0) {
      throw AppException.conflict(
        'ROLE_IN_USE',
        "Bu rolga foydalanuvchilar biriktirilgan. Avval ularning rolini o'zgartiring",
        { usersCount: role.usersCount },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // O'chirilgan (soft delete) foydalanuvchilar hali rolga bog'langan bo'lishi mumkin.
      const fallback = await tx.role.findUniqueOrThrow({
        where: { key: SYSTEM_ROLES.ADMIN },
        select: { id: true },
      });
      await tx.user.updateMany({
        where: { roleId: id, deletedAt: { not: null } },
        data: { roleId: fallback.id },
      });
      await tx.role.delete({ where: { id } });
      await this.audit.log(
        {
          action: 'role.delete',
          resource: 'role',
          resourceId: id,
          before: { name: role.name, description: role.description, permissions: role.permissions },
        },
        tx,
      );
    });
  }

  private async assertNameAvailable(name: string, exceptId?: string): Promise<void> {
    const existing = await this.prisma.role.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (existing) {
      throw AppException.conflict('ROLE_NAME_TAKEN', 'Bunday nomli rol mavjud');
    }
  }

  private async permissionLinks(tx: Prisma.TransactionClient, keys: string[]) {
    const permissions = await tx.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true },
    });
    return permissions.map((permission) => ({ permissionId: permission.id }));
  }
}
