import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PhoneInput } from '@/components/shared/PhoneInput';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { roleKeys, rolesApi } from '@/features/roles/api/roles.api';
import { toApiError } from '@/lib/api-error';
import { errorMessage } from '@/lib/error-message';
import { generatePassword } from '@/lib/password-policy';
import { userKeys, usersApi } from '../api/users.api';
import { type UserFormValues, createUserSchema, updateUserSchema } from '../schemas/user.schemas';
import type { User } from '../types/user.types';
import { TempPasswordField } from './TempPasswordField';

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Berilsa — tahrirlash; berilmasa — yangi foydalanuvchi. */
  user?: User;
}

const emptyValues = (): UserFormValues => ({
  fullName: '',
  email: '',
  phone: '',
  roleId: '',
  password: generatePassword(),
});

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = user !== undefined;

  const form = useForm<UserFormValues>({
    resolver: zodResolver(isEdit ? updateUserSchema : createUserSchema),
    defaultValues: emptyValues(),
  });

  // Dialog har ochilganda forma tanlangan foydalanuvchi (yoki bo'sh qiymatlar) bilan to'ldiriladi.
  useEffect(() => {
    if (!open) return;
    form.reset(
      user
        ? {
            fullName: user.fullName,
            email: user.email,
            phone: user.phone ?? '',
            roleId: user.role.id,
            password: '',
          }
        : emptyValues(),
    );
  }, [open, user, form]);

  const rolesQuery = useQuery({ queryKey: roleKeys.list, queryFn: rolesApi.list, enabled: open });

  const mutation = useMutation({
    mutationFn: (values: UserFormValues) => {
      const payload = {
        fullName: values.fullName,
        email: values.email.toLowerCase(),
        phone: values.phone || null,
        roleId: values.roleId,
      };
      return user
        ? usersApi.update(user.id, payload)
        : usersApi.create({ ...payload, password: values.password });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
      await queryClient.invalidateQueries({ queryKey: roleKeys.all });
      toast.success(t(isEdit ? 'users.toast.updated' : 'users.toast.created'));
      onOpenChange(false);
    },
    onError: (error) => {
      if (toApiError(error).code === 'EMAIL_TAKEN') {
        form.setError('email', { message: 'errors.codes.EMAIL_TAKEN' }, { shouldFocus: true });
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(isEdit ? 'users.form.editTitle' : 'users.form.createTitle')}</DialogTitle>
          <DialogDescription>
            {t(isEdit ? 'users.form.editDescription' : 'users.form.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="grid gap-5"
            noValidate
          >
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('users.form.fullName')}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" placeholder="Aliyev Vali" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.form.email')}</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="off"
                        placeholder="xodim@gavhar.uz"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('users.form.phone')}{' '}
                      <span className="font-normal text-muted-foreground">
                        ({t('common.optional')})
                      </span>
                    </FormLabel>
                    <FormControl>
                      <PhoneInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="roleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('users.form.role')}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={rolesQuery.isLoading}
                  >
                    <FormControl>
                      <SelectTrigger ref={field.ref} onBlur={field.onBlur}>
                        <SelectValue placeholder={t('users.form.rolePlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {rolesQuery.data?.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isEdit && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.form.password')}</FormLabel>
                    <FormControl>
                      <TempPasswordField {...field} />
                    </FormControl>
                    <FormDescription>{t('users.form.passwordHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                {t(isEdit ? 'common.save' : 'common.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
