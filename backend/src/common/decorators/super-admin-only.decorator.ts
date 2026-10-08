import { SetMetadata } from '@nestjs/common';

export const SUPER_ADMIN_ONLY_KEY = 'auth:superAdminOnly';

/** Faqat SUPER_ADMIN: foydalanuvchilar, rollar, audit log. */
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_ONLY_KEY, true);
