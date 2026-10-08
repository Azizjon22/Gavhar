import { z } from 'zod';

export const hallFormSchema = z.object({
  name: z.string().trim().min(2, 'validation.hallName').max(80, 'validation.hallName'),
  capacity: z.string().regex(/^[1-9]\d{0,3}$|^10000$/, 'validation.capacity'),
  description: z.string().trim().max(1000, 'validation.noteMax'),
  status: z.enum(['ACTIVE', 'MAINTENANCE']),
});
export type HallFormValues = z.infer<typeof hallFormSchema>;
