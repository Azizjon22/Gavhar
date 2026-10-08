import { z } from 'zod';
import { isStrongPassword } from '@/lib/password-policy';
import { UZ_PHONE } from '@/lib/phone';

const baseFields = {
  fullName: z.string().trim().min(2, 'validation.fullName').max(100, 'validation.fullName'),
  email: z.string().trim().min(1, 'validation.required').email('validation.email').max(254),
  // Bo'sh satr — telefon kiritilmagan.
  phone: z
    .string()
    .trim()
    .refine((value) => value === '' || UZ_PHONE.test(value), 'validation.phoneIncomplete'),
  roleId: z.string().min(1, 'validation.roleRequired'),
};

export const createUserSchema = z.object({
  ...baseFields,
  password: z.string().refine(isStrongPassword, 'validation.passwordPolicy'),
});

/** Tahrirlashda parol o'zgarmaydi — maydon forma tipida qoladi, lekin tekshirilmaydi. */
export const updateUserSchema = z.object({ ...baseFields, password: z.string() });

export type UserFormValues = z.infer<typeof createUserSchema>;

export const resetPasswordSchema = z.object({
  newPassword: z.string().refine(isStrongPassword, 'validation.passwordPolicy'),
});
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
