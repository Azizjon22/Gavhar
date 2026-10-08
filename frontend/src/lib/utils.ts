import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Shartli klasslarni birlashtiradi va Tailwind ziddiyatlarini hal qiladi. */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

/** "Aliyev Vali" → "AV". Avatar uchun. */
export const initials = (fullName: string): string =>
  fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
