import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Endpoint autentifikatsiyasiz ochiq. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
