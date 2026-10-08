import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { PasswordInput } from '@/components/ui/password-input';
import { toApiError } from '@/lib/api-error';
import { errorMessage } from '@/lib/error-message';
import { authApi } from '../api/auth.api';
import { type ChangePasswordValues, changePasswordSchema } from '../schemas/auth.schemas';
import { PasswordChecklist } from './PasswordChecklist';

interface ChangePasswordFormProps {
  submitLabel: string;
  onSuccess: () => void | Promise<void>;
}

/** Majburiy parol almashtirish sahifasi va profil uchun umumiy forma. */
export function ChangePasswordForm({ submitLabel, onSuccess }: ChangePasswordFormProps) {
  const { t } = useTranslation();
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const mutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: ChangePasswordValues) =>
      authApi.changePassword({ currentPassword, newPassword }),
    onSuccess: async () => {
      form.reset();
      toast.success(t('password.changed'));
      await onSuccess();
    },
    onError: (error) => {
      if (toApiError(error).code === 'INVALID_PASSWORD') {
        form.setError(
          'currentPassword',
          { message: 'errors.codes.INVALID_PASSWORD' },
          { shouldFocus: true },
        );
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="grid gap-5"
        noValidate
      >
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('password.current')}</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('password.new')}</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <PasswordChecklist value={field.value} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('password.confirm')}</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" loading={mutation.isPending} className="mt-1 justify-self-start">
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
}
