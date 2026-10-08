import { http } from '@/lib/api-client';

/** Taom: paket tarkibida yozilgan nom, unga berilgan rasm va tavsif. */
export interface Dish {
  name: string;
  description: string | null;
  photo: { url: string; thumbUrl: string } | null;
  /** Nechta paketda bor (faqat ro'yxatda keladi). */
  packages?: number;
}

export const dishesApi = {
  list: () => http.get<Dish[]>('/menu/dishes'),
  save: (name: string, description: string | null) =>
    http.put<Dish>('/menu/dishes', { name, description }),
  uploadPhoto: (name: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.post<Dish>('/menu/dishes/photo', form, { params: { name }, timeout: 120_000 });
  },
  removePhoto: (name: string) =>
    http.delete<Dish>(`/menu/dishes/photo?name=${encodeURIComponent(name)}`),
};

export const dishKeys = { list: ['menu', 'dishes'] as const };

/** Taom nomi bo'yicha tez topish uchun (harf kattaligidan qat'i nazar). */
export const dishIndex = (dishes: readonly Dish[] | undefined): Map<string, Dish> =>
  new Map((dishes ?? []).map((dish) => [dish.name.trim().toLowerCase(), dish]));
