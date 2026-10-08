/**
 * Tizimdagi barcha ruxsatlarning yagona manbai. Seed shu ro'yxatni bazaga
 * sinxronlaydi; `@Permissions()` faqat shu kalitlarni qabul qiladi.
 *
 * Foydalanuvchilar, rollar va audit log bu yerda yo'q — ular faqat
 * SUPER_ADMIN uchun (`@SuperAdminOnly()`) va hech qanday rolga berilmaydi.
 */
const crud = (noun: string) =>
  ({
    read: `${noun} — ko'rish`,
    create: `${noun} — qo'shish`,
    update: `${noun} — tahrirlash`,
    delete: `${noun} — o'chirish`,
  }) as const;

const RESOURCES = {
  dashboard: { read: "Dashboard — ko'rish" },
  events: crud('Bronlar'),
  halls: crud('Zallar'),
  clients: crud('Mijozlar'),
  finance: {
    ...crud('Moliya'),
    export: 'Moliya — hisobotlarni eksport qilish',
    'manage-categories': 'Moliya — kategoriyalarni boshqarish',
  },
  menu: crud('Menyu'),
  warehouse: crud('Ombor'),
  shopping: {
    read: "Bozorlik — ko'rish",
    create: "Bozorlik — ro'yxat yozish",
    purchase: 'Bozorlik — xarid qilish va narx kiritish',
  },
  studio: crud('Studio'),
  media: {
    read: "Media — ko'rish",
    upload: 'Media — yuklash',
    delete: "Media — o'chirish",
    share: 'Media — mijozga ulashish',
  },
  staff: crud('Xodimlar'),
  settings: { read: "Sozlamalar — ko'rish", update: 'Sozlamalar — tahrirlash' },
  notifications: { read: "Bildirishnomalar — ko'rish" },
} as const;

type Resources = typeof RESOURCES;

export type PermissionKey = {
  [R in keyof Resources]: `${R & string}:${keyof Resources[R] & string}`;
}[keyof Resources];

export interface PermissionDefinition {
  key: PermissionKey;
  resource: string;
  action: string;
  description: string;
}

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = Object.entries(
  RESOURCES,
).flatMap(([resource, actions]) =>
  Object.entries(actions).map(([action, description]) => ({
    key: `${resource}:${action}` as PermissionKey,
    resource,
    action,
    description,
  })),
);

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_CATALOG.map((p) => p.key);

const PERMISSION_KEY_SET: ReadonlySet<string> = new Set(ALL_PERMISSION_KEYS);

export const isPermissionKey = (value: string): value is PermissionKey =>
  PERMISSION_KEY_SET.has(value);

export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  COOK: 'COOK',
  ZAVZAL: 'ZAVZAL',
} as const;

/** ADMIN roli yaratilganda oladigan standart ruxsatlar (SUPER_ADMIN keyin o'zgartira oladi). */
/**
 * Admin kundalik ishni yuritadi, lekin pulni ko'rmaydi: tushum, to'lovlar, xarajatlar va
 * sof foyda faqat SUPER_ADMIN'da (u istasa, rolga moliya ruxsatlarini o'zi beradi).
 */
export const DEFAULT_ADMIN_PERMISSIONS: readonly PermissionKey[] = ALL_PERMISSION_KEYS.filter(
  (key) => !key.startsWith('finance:'),
);

/** Zavzal: to'ylarni (pulsiz) ko'radi, ishchilarni yuritadi va to'ylarga biriktiradi. */
export const DEFAULT_ZAVZAL_PERMISSIONS: readonly PermissionKey[] = [
  'dashboard:read',
  'events:read',
  'halls:read',
  'staff:read',
  'staff:create',
  'staff:update',
];

/** Oshpaz: to'ylar ro'yxatini (pulsiz) ko'radi va bozorlik yozadi — boshqa hech narsa. */
export const DEFAULT_COOK_PERMISSIONS: readonly PermissionKey[] = [
  'shopping:read',
  'shopping:create',
];
