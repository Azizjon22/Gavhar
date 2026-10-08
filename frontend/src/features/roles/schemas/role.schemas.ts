import { z } from 'zod';

export const roleFormSchema = z.object({
  name: z.string().trim().min(2, 'validation.roleName').max(50, 'validation.roleName'),
  description: z.string().trim().max(200, 'validation.descriptionMax'),
  permissions: z.array(z.string()),
});
export type RoleFormValues = z.infer<typeof roleFormSchema>;
