import { z } from 'zod';
import { isStrongPassword } from '@/lib/password-policy';

/** Xabarlar — i18n kalitlari; `FormMessage` ularni tarjima qiladi. */
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'validation.required').email('validation.email'),
  password: z.string().min(1, 'validation.required'),
});
export type LoginValues = z.infer<typeof loginSchema>;

/** Login paytida: 6 xonali kod yoki zaxira kod (XXXXX-XXXXX). */
export const loginCodeSchema = z.object({
  code: z.string().trim().min(6, 'validation.code').max(20, 'validation.code'),
});
export type LoginCodeValues = z.infer<typeof loginCodeSchema>;

export const totpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'validation.totp'),
});
export type TotpCodeValues = z.infer<typeof totpCodeSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'validation.required'),
    newPassword: z.string().refine(isStrongPassword, 'validation.passwordPolicy'),
    confirmPassword: z.string().min(1, 'validation.required'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'validation.passwordMismatch',
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ['newPassword'],
    message: 'validation.passwordSame',
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export const disableTwoFactorSchema = z.object({
  password: z.string().min(1, 'validation.required'),
  code: z.string().trim().min(6, 'validation.code').max(20, 'validation.code'),
});
export type DisableTwoFactorValues = z.infer<typeof disableTwoFactorSchema>;
