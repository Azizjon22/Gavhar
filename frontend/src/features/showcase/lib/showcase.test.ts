import { describe, expect, it } from 'vitest';
import type { Dish } from '@/features/menu/api/dishes.api';
import type { MenuPackage } from '@/features/menu/types/menu.types';
import {
  cardsPerRow,
  dishCount,
  packageCover,
  packagePhotos,
  romanNumeral,
  sectionDishes,
} from './package';

const photo = (name: string) => ({ url: `/${name}.webp`, thumbUrl: `/${name}-thumb.webp` });
const dishes = new Map<string, Dish>([
  ['sezar', { name: 'Sezar', description: 'Tovuq, parmezan', photo: photo('sezar') }],
  ['olivye', { name: 'Olivye', description: null, photo: null }],
  ['to‘y oshi', { name: 'To‘y oshi', description: null, photo: photo('osh') }],
]);
const pkg = (overrides: Partial<MenuPackage> = {}): MenuPackage => ({
  id: 'p1',
  name: 'Premium',
  description: null,
  price: '60000000.00',
  guestCount: 300,
  packageType: 'FULL',
  badge: null,
  isActive: true,
  sortOrder: 0,
  cover: null,
  updatedAt: '2026-10-08T00:00:00.000Z',
  sections: [
    {
      categoryId: 'c1',
      nameUz: 'Salatlar',
      nameRu: 'Салаты',
      kindsCount: 4,
      items: ['SEZAR ', 'Olivye', 'Vinegret'],
    },
    { categoryId: 'c2', nameUz: 'Quyuq', nameRu: 'Вторые', kindsCount: 2, items: ['To‘y oshi'] },
    { categoryId: 'c3', nameUz: 'Mevalar', nameRu: 'Фрукты', kindsCount: 5, items: [] },
    { categoryId: 'c4', nameUz: 'Milliy', nameRu: 'Нац.', kindsCount: 1, items: ['Sezar'] },
  ],
  ...overrides,
});

describe('paket yordamchilari', () => {
  it('taom nomini katalog bilan harf kattaligidan qat’i nazar bog‘laydi', () => {
    expect(sectionDishes(pkg().sections[0]!, dishes)).toEqual([
      { name: 'SEZAR ', description: 'Tovuq, parmezan', photo: photo('sezar') },
      { name: 'Olivye', description: null, photo: null },
      { name: 'Vinegret', description: null, photo: null },
    ]);
  });

  it('taomlar sonini hisoblaydi: nomlar yozilmagan bo‘limda — necha xil', () => {
    expect(dishCount(pkg())).toBe(4 + 2 + 5 + 1);
  });

  it('rasmlarni takrorsiz yig‘adi', () => {
    expect(packagePhotos(pkg(), dishes).map((item) => item.id)).toEqual(['SEZAR ', 'To‘y oshi']);
  });

  it('taom nomi yozilmagan bo‘lim rasmini o‘zbekcha yoki ruscha nom bilan oladi', () => {
    const withFruit = new Map(dishes);
    withFruit.set('фрукты', {
      name: 'Фрукты',
      description: null,
      photo: photo('fruit'),
    });
    expect(packagePhotos(pkg(), withFruit).map((item) => item.id)).toContain('Mevalar');
  });

  it('muqova: yuklangan rasm, bo‘lmasa birinchi rasmli taom, bo‘lmasa yo‘q', () => {
    expect(packageCover(pkg({ cover: photo('cover') }), dishes)).toBe('/cover.webp');
    expect(packageCover(pkg(), dishes)).toBe('/sezar.webp');
    expect(packageCover(pkg(), new Map())).toBeNull();
  });

  it('rim raqami va qatordagi kartalar soni', () => {
    expect([0, 3, 11, 12].map(romanNumeral)).toEqual(['I', 'IV', 'XII', '13']);
    expect([1, 2, 3, 4, 5, 6, 8].map(cardsPerRow)).toEqual([3, 3, 3, 4, 4, 3, 4]);
  });
});
