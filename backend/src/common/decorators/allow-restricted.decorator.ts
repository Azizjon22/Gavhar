import { SetMetadata } from '@nestjs/common';

export const ALLOW_RESTRICTED_KEY = 'auth:allowRestricted';

/**
 * Hisob cheklangan holatda ham (parolni o'zgartirish majburiy yoki 2FA hali
 * ulanmagan) ochiq qoladigan endpointlar: profil, parol, 2FA sozlash.
 */
export const AllowRestricted = () => SetMetadata(ALLOW_RESTRICTED_KEY, true);
