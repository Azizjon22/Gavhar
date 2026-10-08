import { describe, expect, it } from 'vitest';
import { localizedName } from '@/features/menu/types/menu.types';
import { formatDuration } from './gallery.types';

describe('formatDuration', () => {
  it('soniyani daqiqa:soniya ko‘rinishiga keltiradi', () => {
    expect(formatDuration(95)).toBe('1:35');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('davomiylik noma’lum bo‘lsa null qaytaradi', () => {
    expect(formatDuration(null)).toBeNull();
  });
});

describe('localizedName', () => {
  const category = { nameUz: 'Salatlar', nameRu: 'Салаты' };

  it('tanlangan tildagi nomni qaytaradi', () => {
    expect(localizedName(category, 'uz')).toBe('Salatlar');
    expect(localizedName(category, 'ru')).toBe('Салаты');
  });
});
