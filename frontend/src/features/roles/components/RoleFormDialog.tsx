import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
import { Skeleton } from '@/components/ui/skeleton';
import { toApiError } from '@/lib/api-error';
import { errorMessage } from '@/lib/error-message';
import { roleKeys, rolesApi } from '../api/roles.api';
import { type RoleFormValues, roleFormSchema } from '../schemas/role.schemas';
import type { Role } from '../types/role.types';
import { PermissionMatrix } from './PermissionMatrix';

interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Berilsa — tahrirlash; berilmasa — yangi rol. */
  role?: Role;
}

export function RoleFormDialog({ open, onOpenChange, role }: RoleFormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = role !== undefined;

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: { name: '', description: '', permissions: [] },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: role?.name ?? '',
      description: role?.description ?? '',
      permissions: role?.permissions ?? [],
    });
  }, [open, role, form]);

  const catalogQuery = useQuery({
    queryKey: roleKeys.permissionCatalog,
    queryFn: rolesApi.permissionCatalog,
    staleTime: Infinity,
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: (values: RoleFormValues) => {
      const payload = {
        // Tizim rolining nomi o'zgarmaydi — serverga yuborilmaydi.
        ...(!role?.isSystem && { name: values.name }),
        description: values.description || null,
        permissions: values.permissions,
      };
      return role
        ? rolesApi.update(role.id, payload)
        : rolesApi.create({ ...payload, name: values.name });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: roleKeys.all });
      toast.success(t(isEdit ? 'roles.toast.updated' : 'roles.toast.created'));
      onOpenChange(false);
    },
    onError: (error) => {
      if (toApiError(error).code === 'ROLE_NAME_TAKEN') {
        form.setError('name', { message: 'errors.codes.ROLE_NAME_TAKEN' }, { shouldFocus: true });
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t(isEdit ? 'roles.form.editTitle' : 'roles.form.createTitle')}</DialogTitle>
          <DialogDescription>{t('roles.form.description')}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="grid gap-5"
            noValidate
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('roles.form.name')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('roles.form.namePlaceholder')}
                        disabled={role?.isSystem}
                        {...field}
                      />
                    </FormControl>
                    {role?.isSystem && (
                      <FormDescription>{t('roles.form.systemNameHint')}</FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('roles.form.roleDescription')}{' '}
                      <span className="font-normal text-muted-foreground">
                        ({t('common.optional')})
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('roles.form.descriptionPlaceholder')}
                        maxLength={200}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="permissions"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-baseline justify-between gap-3">
                    <FormLabel>{t('roles.form.permissions')}</FormLabel>
                    <span className="tabular text-xs text-muted-foreground">
                      {t('roles.form.selected', { count: field.value.length })}
                    </span>
                  </div>
                  {catalogQuery.data ? (
                    <PermissionMatrix
                      catalog={catalogQuery.data}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  ) : (
                    <Skeleton className="h-64 rounded-xl" />
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={mutation.isPending} disabled={!catalogQuery.data}>
                {t(isEdit ? 'common.save' : 'common.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
