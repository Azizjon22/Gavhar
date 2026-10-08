import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../src/common/crypto/password.util';
import {
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_COOK_PERMISSIONS,
  DEFAULT_ZAVZAL_PERMISSIONS,
  PERMISSION_CATALOG,
  SYSTEM_ROLES,
} from '../../src/common/permissions/permission-catalog';
import { passwordPolicyViolations } from '../../src/common/validators/password-policy';

export interface SuperAdminSeed {
  email: string;
  fullName: string;
  password: string;
}

export interface BootstrapResult {
  permissions: number;
  superAdminCreated: boolean;
}

/**
 * Ruxsatlar katalogini bazaga sinxronlaydi: yangilarini qo'shadi, eskirganini o'chiradi.
 * Shu safar birinchi marta qo'shilgan kalitlarni qaytaradi.
 */
async function syncPermissions(prisma: PrismaClient): Promise<string[]> {
  const known = new Set(
    (await prisma.permission.findMany({ select: { key: true } })).map(({ key }) => key),
  );
  for (const permission of PERMISSION_CATALOG) {
    const { key, ...data } = permission;
    await prisma.permission.upsert({ where: { key }, update: data, create: permission });
  }
  await prisma.permission.deleteMany({
    where: { key: { notIn: PERMISSION_CATALOG.map((p) => p.key) } },
  });
  return PERMISSION_CATALOG.map((permission) => permission.key).filter((key) => !known.has(key));
}

async function syncSystemRoles(prisma: PrismaClient, addedKeys: readonly string[]) {
  const superAdmin = await prisma.role.upsert({
    where: { key: SYSTEM_ROLES.SUPER_ADMIN },
    update: { isSystem: true },
    create: {
      key: SYSTEM_ROLES.SUPER_ADMIN,
      name: 'Super admin',
      description: "Tizimga to'liq ruxsat",
      isSystem: true,
    },
  });

  const existingAdmin = await prisma.role.findUnique({ where: { key: SYSTEM_ROLES.ADMIN } });
  if (!existingAdmin) {
    // Standart ruxsatlar faqat birinchi marta beriladi — keyin SUPER_ADMIN
    // kiritgan o'zgarishlar qayta seed qilinganda yo'qolmaydi.
    const permissions = await prisma.permission.findMany({
      where: { key: { in: [...DEFAULT_ADMIN_PERMISSIONS] } },
      select: { id: true },
    });
    await prisma.role.create({
      data: {
        key: SYSTEM_ROLES.ADMIN,
        name: 'Admin',
        description: 'Kundalik ishlar uchun',
        isSystem: true,
        permissions: { create: permissions.map(({ id }) => ({ permissionId: id })) },
      },
    });
  } else {
    // Tizim yangilanganda paydo bo'lgan ruxsatlar (yangi bo'limlar) mavjud ADMIN
    // roliga ham beriladi; SUPER_ADMIN ilgari olib tashlagan ruxsatlar qaytarilmaydi.
    const fresh = await prisma.permission.findMany({
      where: {
        key: { in: addedKeys.filter((key) => DEFAULT_ADMIN_PERMISSIONS.some((k) => k === key)) },
      },
      select: { id: true },
    });
    await prisma.rolePermission.createMany({
      data: fresh.map(({ id }) => ({ roleId: existingAdmin.id, permissionId: id })),
      skipDuplicates: true,
    });
  }

  const existingCook = await prisma.role.findUnique({ where: { key: SYSTEM_ROLES.COOK } });
  if (!existingCook) {
    const permissions = await prisma.permission.findMany({
      where: { key: { in: [...DEFAULT_COOK_PERMISSIONS] } },
      select: { id: true },
    });
    await prisma.role.create({
      data: {
        key: SYSTEM_ROLES.COOK,
        name: 'Oshpaz',
        description: 'To‘ylarni ko‘radi va bozorlik ro‘yxatini yozadi',
        isSystem: true,
        permissions: { create: permissions.map(({ id }) => ({ permissionId: id })) },
      },
    });
  }

  const existingZavzal = await prisma.role.findUnique({ where: { key: SYSTEM_ROLES.ZAVZAL } });
  if (!existingZavzal) {
    const permissions = await prisma.permission.findMany({
      where: { key: { in: [...DEFAULT_ZAVZAL_PERMISSIONS] } },
      select: { id: true },
    });
    await prisma.role.create({
      data: {
        key: SYSTEM_ROLES.ZAVZAL,
        name: 'Zavzal',
        description: 'To‘ylarni pulsiz ko‘radi, ishchilarni yuritadi va to‘ylarga biriktiradi',
        isSystem: true,
        permissions: { create: permissions.map(({ id }) => ({ permissionId: id })) },
      },
    });
  }

  return superAdmin;
}

/**
 * Idempotent: necha marta ishga tushirilsa ham natija bir xil. Birinchi
 * SUPER_ADMIN faqat tizimda hech qanday SUPER_ADMIN bo'lmaganda yaratiladi.
 */
export async function bootstrapAccessControl(
  prisma: PrismaClient,
  admin: SuperAdminSeed,
  pepper: string,
): Promise<BootstrapResult> {
  const violations = passwordPolicyViolations(admin.password);
  if (violations.length > 0) {
    throw new Error(
      `SEED_SUPER_ADMIN_PASSWORD parol siyosatiga mos emas: ${violations.join(', ')}`,
    );
  }

  const addedKeys = await syncPermissions(prisma);
  const permissions = PERMISSION_CATALOG.length;
  const superAdminRole = await syncSystemRoles(prisma, addedKeys);

  const existing = await prisma.user.count({
    where: { roleId: superAdminRole.id, deletedAt: null },
  });
  if (existing > 0) {
    return { permissions, superAdminCreated: false };
  }

  await prisma.user.create({
    data: {
      email: admin.email.trim().toLowerCase(),
      fullName: admin.fullName,
      passwordHash: await hashPassword(admin.password, pepper),
      roleId: superAdminRole.id,
      mustChangePassword: true,
    },
  });
  return { permissions, superAdminCreated: true };
}
