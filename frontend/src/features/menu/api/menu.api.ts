import { http } from '@/lib/api-client';
import type { MenuCategory, MenuPackage, MenuPackagePayload } from '../types/menu.types';

export const menuApi = {
  categories: () => http.get<MenuCategory[]>('/menu/categories'),
  createCategory: (body: { nameUz: string; nameRu: string }) =>
    http.post<MenuCategory>('/menu/categories', body),
  updateCategory: (id: string, body: { nameUz: string; nameRu: string }) =>
    http.patch<MenuCategory>(`/menu/categories/${id}`, body),
  removeCategory: (id: string) => http.delete(`/menu/categories/${id}`),
  reorderCategories: (ids: string[]) => http.put<MenuCategory[]>('/menu/categories/order', { ids }),

  packages: () => http.get<MenuPackage[]>('/menu/packages'),
  createPackage: (body: MenuPackagePayload) => http.post<MenuPackage>('/menu/packages', body),
  updatePackage: (id: string, body: Partial<MenuPackagePayload>) =>
    http.patch<MenuPackage>(`/menu/packages/${id}`, body),
  removePackage: (id: string) => http.delete(`/menu/packages/${id}`),
  uploadCover: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.post<MenuPackage>(`/menu/packages/${id}/cover`, form, { timeout: 120_000 });
  },
  removeCover: (id: string) => http.delete<MenuPackage>(`/menu/packages/${id}/cover`),
};

export const menuKeys = {
  all: ['menu'] as const,
  categories: ['menu', 'categories'] as const,
  packages: ['menu', 'packages'] as const,
};
