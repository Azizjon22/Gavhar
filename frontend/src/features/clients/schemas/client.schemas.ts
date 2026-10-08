import { z } from 'zod';
import { UZ_PHONE } from '@/lib/phone';

export const clientFormSchema = z.object({
  fullName: z.string().trim().min(2, 'validation.fullName').max(100, 'validation.fullName'),
  phone: z.string().regex(UZ_PHONE, 'validation.phoneIncomplete'),
  // Bo'sh satr — qo'shimcha raqam kiritilmagan.
  phoneExtra: z
    .string()
    .refine((value) => value === '' || UZ_PHONE.test(value), 'validation.phoneIncomplete'),
  note: z.string().trim().max(1000, 'validation.noteMax'),
});
export type ClientFormValues = z.infer<typeof clientFormSchema>;
