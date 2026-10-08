import { useQuery } from '@tanstack/react-query';
import { http } from '@/lib/api-client';

export interface Brand {
  name: string;
  /** Muddatli imzolangan havolalar. */
  logo: { url: string; thumbUrl: string } | null;
}

/** Brend hali yuklanmagan yoki server javob bermagan paytda ko'rsatiladigan nom. */
export const DEFAULT_BRAND: Brand = { name: 'Gavhar', logo: null };

export const brandApi = {
  get: () => http.get<Brand>('/settings/brand'),
  rename: (name: string) => http.put<Brand>('/settings/brand', { name }),
  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.post<Brand>('/settings/brand/logo', form, { timeout: 120_000 });
  },
  removeLogo: () => http.delete<Brand>('/settings/brand/logo'),
};

export const brandKeys = { current: ['brand'] as const };

/**
 * To'yxona nomi va logotipi — hamma ekranda (kirish sahifasi, yon menyu, taqdimot).
 * Kirishdan oldin ham ishlaydi; javob kelguncha standart nom ko'rsatiladi.
 */
export function useBrand(): Brand {
  const query = useQuery({
    queryKey: brandKeys.current,
    queryFn: brandApi.get,
    staleTime: 10 * 60_000,
    retry: false,
  });
  return query.data ?? DEFAULT_BRAND;
}
